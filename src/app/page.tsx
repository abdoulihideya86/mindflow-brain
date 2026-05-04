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
import type { MindNode, MindEdge, BrainStats, FeedParticle } from '@/lib/mindflow/types';

// ─── Utility ────────────────────────────────────────────────
let _nid = 0;
function nid() { return `n${++_nid}_${Date.now()}`; }
function eid() { return `e${Date.now()}_${Math.random().toString(36).slice(2, 7)}`; }

// ─── Constants ──────────────────────────────────────────────
const BRAIN_ID = '__brain__';
const STORAGE_KEY = 'mindflow_brain_state';

// ─── Initial State ──────────────────────────────────────────
function createBrainNode(cx: number, cy: number): MindNode {
  return {
    id: BRAIN_ID,
    label: 'العقل',
    tag: '🧠',
    summary: 'العقل المركزي — يتغذى ويتعلم من كل عقدة تتصل به',
    x: cx,
    y: cy,
    depth: 0,
    parentId: null,
    isBrain: true,
    isCustom: false,
    expanded: false,
    hasChildren: false,
    connections: [],
    knowledgeLevel: 0,
    color: '#f5c400',
    pulsePhase: 0,
    feedParticles: [],
  };
}

function defaultStats(): BrainStats {
  return {
    totalKnowledge: 0,
    totalNodes: 1,
    totalConnections: 0,
    totalFeeds: 0,
    topicsExplored: [],
    growthRate: 0,
    level: 1,
    levelName: 'بذرة',
  };
}

// ─── Persistence ────────────────────────────────────────────
interface PersistedState {
  brainStats: BrainStats;
  customNodes: { label: string; tag: string; summary: string }[];
  exploredTopics: string[];
}

function loadState(): PersistedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

function saveState(stats: BrainStats, customNodes: MindNode[], exploredTopics: string[]) {
  if (typeof window === 'undefined') return;
  try {
    const data: PersistedState = {
      brainStats: stats,
      customNodes: customNodes.filter(n => n.isCustom).map(n => ({
        label: n.label,
        tag: n.tag,
        summary: n.summary,
      })),
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

  // Lazy initializer for state that depends on browser APIs
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
        const angle = (i / persisted.customNodes.length) * Math.PI * 2 - Math.PI / 2;
        const dist = 220 + Math.random() * 80;
        initialNodes.push({
          id: nid(),
          label: cn.label,
          tag: cn.tag,
          summary: cn.summary,
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          depth: 1,
          parentId: BRAIN_ID,
          isBrain: false,
          isCustom: true,
          expanded: false,
          hasChildren: false,
          connections: [BRAIN_ID],
          knowledgeLevel: 50,
          color: '#ff6b9d',
          pulsePhase: Math.random() * Math.PI * 2,
          feedParticles: [],
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

  // ─── Sync refs on mount ──────────────────────────────────
  useEffect(() => {
    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, []);

  // ─── Save on changes ───────────────────────────────────
  useEffect(() => {
    if (nodes.length === 0) return;
    saveState(brainStats, nodes, exploredTopics);
  }, [brainStats, nodes, exploredTopics]);

  // ─── Sync refs ─────────────────────────────────────────
  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // ─── Canvas Resize ─────────────────────────────────────
  useEffect(() => {
    function onResize() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ─── Find node at position ─────────────────────────────
  const findNodeAt = useCallback((sx: number, sy: number): MindNode | null => {
    const vp = viewportRef.current;
    const worldX = (sx - vp.x) / vp.scale;
    const worldY = (sy - vp.y) / vp.scale;
    for (let i = nodesRef.current.length - 1; i >= 0; i--) {
      const n = nodesRef.current[i];
      const r = n.isBrain ? 55 : 32;
      const dx = worldX - n.x;
      const dy = worldY - n.y;
      if (dx * dx + dy * dy < r * r) return n;
    }
    return null;
  }, []);

  // ─── Feed Brain ────────────────────────────────────────
  const feedBrain = useCallback((nodeId: string) => {
    const nodesArr = nodesRef.current;
    const node = nodesArr.find(n => n.id === nodeId);
    const brain = nodesArr.find(n => n.id === BRAIN_ID);
    if (!node || !brain || node.isBrain) return;

    // Create feed particles
    const count = 8;
    const newParticles: FeedParticle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: `p_${Date.now()}_${i}`,
        x: node.x,
        y: node.y,
        targetX: brain.x,
        targetY: brain.y,
        progress: 0,
        speed: 0.015 + Math.random() * 0.015,
        color: node.color,
        size: 3 + Math.random() * 3,
      });
    }
    particlesRef.current = [...particlesRef.current, ...newParticles];

    // Update stats
    const knowledgeGain = 5 + Math.floor(Math.random() * 10);
    setBrainStats(prev => {
      const newKnowledge = prev.totalKnowledge + knowledgeGain;
      const levelInfo = getBrainLevel(newKnowledge);
      return {
        ...prev,
        totalKnowledge: newKnowledge,
        totalFeeds: prev.totalFeeds + 1,
        level: levelInfo.level,
        levelName: levelInfo.name,
        growthRate: Math.round((prev.totalFeeds + 1) / Math.max(1, prev.totalNodes) * 100),
      };
    });

    // Update node knowledge level
    setNodes(prev => prev.map(n =>
      n.id === nodeId
        ? { ...n, knowledgeLevel: Math.min(100, n.knowledgeLevel + 10), connections: n.connections.includes(BRAIN_ID) ? n.connections : [...n.connections, BRAIN_ID] }
        : n
    ));

    // Add edge if not exists
    setEdges(prev => {
      const exists = prev.some(e => (e.from === nodeId && e.to === BRAIN_ID) || (e.from === BRAIN_ID && e.to === nodeId));
      if (!exists) {
        return [...prev, { id: eid(), from: nodeId, to: BRAIN_ID, type: 'feed', strength: 0.5, animated: true }];
      }
      return prev;
    });

    setFeedAnim({ from: nodeId, to: BRAIN_ID });
    setTimeout(() => setFeedAnim(null), 1500);
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
                id: eid(),
                from: nn.id,
                to: existing.id,
                type: 'cross-link',
                strength: 0.3,
                animated: true,
              });
            }
          }
        });
      });
      return [...prev, ...additional];
    });
  }, []);

  // ─── Expand Topic ─────────────────────────────────────
  const expandTopic = useCallback((topicKey: string) => {
    const topic = KNOWLEDGE_BASE[topicKey];
    if (!topic) return;

    const nodesArr = nodesRef.current;
    const brain = nodesArr.find(n => n.id === BRAIN_ID);
    if (!brain) return;

    const newNodes: MindNode[] = [];
    const newEdges: MindEdge[] = [];
    const count = topic.children.length;
    const color = TOPIC_COLORS[topicKey] || '#00ffe0';

    topic.children.forEach((child, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const dist = 200 + Math.random() * 60;
      const childNode: MindNode = {
        id: nid(),
        label: child.label,
        tag: child.tag,
        summary: child.summary || '',
        x: brain.x + Math.cos(angle) * dist,
        y: brain.y + Math.sin(angle) * dist,
        depth: 1,
        parentId: BRAIN_ID,
        isBrain: false,
        isCustom: false,
        expanded: false,
        hasChildren: !!child.children?.length,
        childrenData: child.children,
        connections: [],
        knowledgeLevel: 0,
        color,
        pulsePhase: Math.random() * Math.PI * 2,
        feedParticles: [],
      };
      newNodes.push(childNode);
      newEdges.push({
        id: eid(),
        from: BRAIN_ID,
        to: childNode.id,
        type: 'parent',
        strength: 1,
        animated: false,
      });
    });

    setNodes(prev => [...prev, ...newNodes]);
    setEdges(prev => [...prev, ...newEdges]);
    setBrainStats(prev => ({
      ...prev,
      totalNodes: prev.totalNodes + newNodes.length,
      totalConnections: prev.totalConnections + newEdges.length,
    }));
    setExploredTopics(prev => prev.includes(topicKey) ? prev : [...prev, topicKey]);

    // Auto-feed brain from new nodes
    setTimeout(() => {
      newNodes.forEach((n, i) => {
        setTimeout(() => feedBrain(n.id), i * 200);
      });
    }, 300);

    // Check cross-links
    setTimeout(() => {
      addCrossLinks(newNodes);
    }, 500);
  }, [feedBrain, addCrossLinks]);

  // ─── Expand Sub-nodes ─────────────────────────────────
  const expandNode = useCallback((nodeId: string) => {
    const nodesArr = nodesRef.current;
    const parent = nodesArr.find(n => n.id === nodeId);
    if (!parent || !parent.childrenData?.length) return;
    if (parent.expanded) {
      // Collapse
      setNodes(prev => {
        const toRemove = prev.filter(n => n.parentId === nodeId).map(n => n.id);
        return prev.filter(n => !toRemove.includes(n.id) || n.id === nodeId).map(n =>
          n.id === nodeId ? { ...n, expanded: false } : n
        );
      });
      setEdges(prev => prev.filter(e => {
        const toRemove = nodesRef.current.filter(n => n.parentId === nodeId).map(n => n.id);
        return !toRemove.includes(e.to);
      }));
      return;
    }

    const newNodes: MindNode[] = [];
    const newEdges: MindEdge[] = [];
    const count = parent.childrenData.length;

    parent.childrenData.forEach((child, i) => {
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const dist = 150 + Math.random() * 40;
      const childNode: MindNode = {
        id: nid(),
        label: child.label,
        tag: child.tag,
        summary: child.summary || '',
        x: parent.x + Math.cos(angle) * dist,
        y: parent.y + Math.sin(angle) * dist,
        depth: parent.depth + 1,
        parentId: nodeId,
        isBrain: false,
        isCustom: false,
        expanded: false,
        hasChildren: !!child.children?.length,
        childrenData: child.children,
        connections: [],
        knowledgeLevel: 0,
        color: parent.color,
        pulsePhase: Math.random() * Math.PI * 2,
        feedParticles: [],
      };
      newNodes.push(childNode);
      newEdges.push({
        id: eid(),
        from: nodeId,
        to: childNode.id,
        type: 'parent',
        strength: 0.8,
        animated: false,
      });
    });

    setNodes(prev => [...prev, ...newNodes].map(n => n.id === nodeId ? { ...n, expanded: true } : n));
    setEdges(prev => [...prev, ...newEdges]);
    setBrainStats(prev => ({
      ...prev,
      totalNodes: prev.totalNodes + newNodes.length,
      totalConnections: prev.totalConnections + newEdges.length,
    }));

    // Auto-feed
    setTimeout(() => {
      newNodes.forEach((n, i) => {
        setTimeout(() => feedBrain(n.id), i * 150);
      });
    }, 200);
  }, [feedBrain]);

  // ─── Add Custom Node ──────────────────────────────────
  const addCustomNode = useCallback(() => {
    if (!newLabel.trim()) return;
    const brain = nodesRef.current.find(n => n.id === BRAIN_ID);
    if (!brain) return;

    const angle = Math.random() * Math.PI * 2;
    const dist = 220 + Math.random() * 80;
    const newNode: MindNode = {
      id: nid(),
      label: newLabel.trim(),
      tag: newTag.trim() || 'مخصص',
      summary: newSummary.trim(),
      x: brain.x + Math.cos(angle) * dist,
      y: brain.y + Math.sin(angle) * dist,
      depth: 1,
      parentId: BRAIN_ID,
      isBrain: false,
      isCustom: true,
      expanded: false,
      hasChildren: false,
      connections: [BRAIN_ID],
      knowledgeLevel: 50,
      color: '#ff6b9d',
      pulsePhase: Math.random() * Math.PI * 2,
      feedParticles: [],
    };

    setNodes(prev => [...prev, newNode]);
    setEdges(prev => [...prev, {
      id: eid(),
      from: BRAIN_ID,
      to: newNode.id,
      type: 'feed',
      strength: 0.6,
      animated: true,
    }]);
    setBrainStats(prev => ({
      ...prev,
      totalNodes: prev.totalNodes + 1,
      totalConnections: prev.totalConnections + 1,
      totalKnowledge: prev.totalKnowledge + 15,
      totalFeeds: prev.totalFeeds + 1,
      level: getBrainLevel(prev.totalKnowledge + 15).level,
      levelName: getBrainLevel(prev.totalKnowledge + 15).name,
    }));

    setNewLabel('');
    setNewTag('');
    setNewSummary('');
    setAddDialogOpen(false);

    // Feed animation
    setTimeout(() => feedBrain(newNode.id), 100);
  }, [newLabel, newTag, newSummary, feedBrain]);

  // ─── Manual Connect ────────────────────────────────────
  const connectNodes = useCallback((fromId: string, toId: string) => {
    setEdges(prev => {
      const exists = prev.some(e =>
        (e.from === fromId && e.to === toId) ||
        (e.from === toId && e.to === fromId)
      );
      if (exists) return prev;
      return [...prev, {
        id: eid(),
        from: fromId,
        to: toId,
        type: 'cross-link',
        strength: 0.5,
        animated: true,
      }];
    });
    setNodes(prev => prev.map(n => {
      if (n.id === fromId) return { ...n, connections: [...n.connections, toId] };
      if (n.id === toId) return { ...n, connections: [...n.connections, fromId] };
      return n;
    }));
    setBrainStats(prev => ({
      ...prev,
      totalConnections: prev.totalConnections + 1,
      totalKnowledge: prev.totalKnowledge + 8,
    }));
  }, []);

  // ─── Delete Node ───────────────────────────────────────
  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === BRAIN_ID) return;
    // Remove children recursively
    const toRemove = new Set<string>();
    function collect(id: string) {
      toRemove.add(id);
      nodesRef.current.filter(n => n.parentId === id).forEach(n => collect(n.id));
    }
    collect(nodeId);

    setNodes(prev => prev.filter(n => !toRemove.has(n.id)));
    setEdges(prev => prev.filter(e => !toRemove.has(e.from) && !toRemove.has(e.to)));
    setSelectedNode(null);
  }, []);

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

      ctx.clearRect(0, 0, W, H);

      // Background grid
      ctx.save();
      ctx.translate(vp.x % (48 * vp.scale), vp.y % (48 * vp.scale));
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      for (let x = 0; x < W + 48 * vp.scale; x += 48 * vp.scale) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }
      for (let y = 0; y < H + 48 * vp.scale; y += 48 * vp.scale) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      ctx.restore();

      // Background glow
      const gradient = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, W * 0.6);
      gradient.addColorStop(0, 'rgba(0, 255, 224, 0.04)');
      gradient.addColorStop(0.5, 'rgba(255, 60, 172, 0.02)');
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(vp.x, vp.y);
      ctx.scale(vp.scale, vp.scale);

      const currentNodes = nodesRef.current;
      const currentEdges = edgesRef.current;
      const brain = currentNodes.find(n => n.isBrain);

      // ─── Draw Edges ────────────────────────────────
      currentEdges.forEach(edge => {
        const from = currentNodes.find(n => n.id === edge.from);
        const to = currentNodes.find(n => n.id === edge.to);
        if (!from || !to) return;

        const fromR = from.isBrain ? 55 : 32;
        const toR = to.isBrain ? 55 : 32;
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist === 0) return;

        const nx = dx / dist;
        const ny = dy / dist;
        const sx = from.x + nx * fromR;
        const sy = from.y + ny * fromR;
        const ex = to.x - nx * toR;
        const ey = to.y - ny * toR;

        const mx = (sx + ex) / 2;
        const my = (sy + ey) / 2 - 20;

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo(mx, my, ex, ey);

        if (edge.type === 'feed') {
          const grad = ctx.createLinearGradient(sx, sy, ex, ey);
          grad.addColorStop(0, 'rgba(245, 196, 0, 0.6)');
          grad.addColorStop(1, 'rgba(0, 255, 224, 0.4)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 2;
          ctx.setLineDash([]);
        } else if (edge.type === 'cross-link') {
          ctx.strokeStyle = `rgba(255, 107, 157, ${0.15 + edge.strength * 0.25})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 8]);
        } else {
          const grad = ctx.createLinearGradient(sx, sy, ex, ey);
          grad.addColorStop(0, 'rgba(0, 255, 224, 0.4)');
          grad.addColorStop(1, 'rgba(167, 139, 250, 0.3)');
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 6]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated dot along edge
        if (edge.animated || edge.type === 'feed') {
          const progress = ((t * 0.3 + edge.strength) % 1);
          const qx = (1 - progress) * (1 - progress) * sx + 2 * (1 - progress) * progress * mx + progress * progress * ex;
          const qy = (1 - progress) * (1 - progress) * sy + 2 * (1 - progress) * progress * my + progress * progress * ey;
          ctx.beginPath();
          ctx.arc(qx, qy, edge.type === 'feed' ? 3 : 2, 0, Math.PI * 2);
          ctx.fillStyle = edge.type === 'feed' ? '#f5c400' : edge.type === 'cross-link' ? '#ff6b9d' : '#00ffe0';
          ctx.fill();
        }

        // End dot
        ctx.beginPath();
        ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = edge.type === 'feed' ? 'rgba(245,196,0,0.7)' : edge.type === 'cross-link' ? 'rgba(255,107,157,0.5)' : 'rgba(0,255,224,0.5)';
        ctx.fill();
      });

      // ─── Draw Feed Particles ───────────────────────
      const remainingParticles: FeedParticle[] = [];
      particlesRef.current.forEach(p => {
        p.progress += p.speed;
        if (p.progress >= 1) return;

        const x = p.x + (p.targetX - p.x) * p.progress;
        const y = p.y + (p.targetY - p.y) * p.progress;
        const alpha = 1 - p.progress;
        const size = p.size * (1 - p.progress * 0.5);

        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = p.color + Math.round(alpha * 255).toString(16).padStart(2, '0');
        ctx.fill();

        // Glow
        const glow = ctx.createRadialGradient(x, y, 0, x, y, size * 3);
        glow.addColorStop(0, p.color + Math.round(alpha * 100).toString(16).padStart(2, '0'));
        glow.addColorStop(1, 'transparent');
        ctx.fillStyle = glow;
        ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);

        remainingParticles.push(p);
      });
      particlesRef.current = remainingParticles;

      // ─── Draw Nodes ────────────────────────────────
      currentNodes.forEach(node => {
        const isBrain = node.isBrain;
        const isSelected = selectedNode?.id === node.id;
        const radius = isBrain
          ? 40 + Math.sin(t * 2) * 5 + (brainStats.totalKnowledge / 50)
          : 25 + node.knowledgeLevel / 10;

        // Outer glow
        if (isBrain) {
          const pulseScale = 1 + Math.sin(t * 1.5) * 0.08;
          for (let ring = 3; ring >= 0; ring--) {
            const ringR = radius * pulseScale + ring * 15;
            const alpha = 0.06 - ring * 0.012;
            ctx.beginPath();
            ctx.arc(node.x, node.y, ringR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(245, 196, 0, ${alpha})`;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        // Node body
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        const bodyGrad = ctx.createRadialGradient(node.x - radius * 0.3, node.y - radius * 0.3, 0, node.x, node.y, radius);
        if (isBrain) {
          bodyGrad.addColorStop(0, 'rgba(40, 35, 10, 0.95)');
          bodyGrad.addColorStop(1, 'rgba(20, 18, 5, 0.95)');
        } else {
          bodyGrad.addColorStop(0, 'rgba(10, 10, 20, 0.92)');
          bodyGrad.addColorStop(1, 'rgba(5, 5, 12, 0.92)');
        }
        ctx.fillStyle = bodyGrad;
        ctx.fill();

        // Border
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        if (isBrain) {
          const pulseAlpha = 0.5 + Math.sin(t * 2) * 0.2;
          ctx.strokeStyle = `rgba(245, 196, 0, ${pulseAlpha})`;
          ctx.lineWidth = 2.5;
        } else if (isSelected) {
          ctx.strokeStyle = 'rgba(0, 255, 224, 0.8)';
          ctx.lineWidth = 2;
        } else if (node.isCustom) {
          ctx.strokeStyle = 'rgba(255, 107, 157, 0.5)';
          ctx.lineWidth = 1.5;
        } else {
          ctx.strokeStyle = node.color + '60';
          ctx.lineWidth = 1.5;
        }
        ctx.stroke();

        // Knowledge fill indicator
        if (!isBrain && node.knowledgeLevel > 0) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius - 3, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * node.knowledgeLevel / 100));
          ctx.strokeStyle = node.color + '80';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Brain inner rings
        if (isBrain) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * 0.6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 196, 0, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(node.x, node.y, radius * 0.3, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(245, 196, 0, 0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();

          // Rotating orbit dots
          for (let i = 0; i < 4; i++) {
            const angle = t * 0.8 + (i * Math.PI / 2);
            const orbitR = radius * 0.75;
            const ox = node.x + Math.cos(angle) * orbitR;
            const oy = node.y + Math.sin(angle) * orbitR;
            ctx.beginPath();
            ctx.arc(ox, oy, 2, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(245, 196, 0, 0.6)';
            ctx.fill();
          }
        }

        // Label
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        if (isBrain) {
          ctx.font = 'bold 16px sans-serif';
          ctx.fillStyle = '#f5c400';
          ctx.fillText('🧠', node.x, node.y - 6);
          ctx.font = 'bold 13px sans-serif';
          ctx.fillText('العقل', node.x, node.y + 14);
        } else {
          // Truncate label
          const maxLen = radius < 30 ? 10 : 14;
          const displayLabel = node.label.length > maxLen ? node.label.slice(0, maxLen) + '..' : node.label;
          ctx.font = 'bold 11px sans-serif';
          ctx.fillStyle = node.isCustom ? '#ff6b9d' : node.color;
          ctx.fillText(displayLabel, node.x, node.y - 4);

          // Tag
          ctx.font = '9px sans-serif';
          ctx.fillStyle = 'rgba(232, 232, 240, 0.4)';
          ctx.fillText(node.tag, node.x, node.y + 10);
        }

        // Selection highlight
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 6, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0, 255, 224, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Connect mode highlight
        if (connectMode && connectFrom && node.id !== connectFrom && !node.isBrain) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255, 107, 157, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      ctx.restore();
      animRef.current = requestAnimationFrame(render);
    }

    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [selectedNode, brainStats.totalKnowledge, connectMode, connectFrom]);

  // ─── Mouse/Touch Handlers ──────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function screenToWorld(sx: number, sy: number) {
      const vp = viewportRef.current;
      return { x: (sx - vp.x) / vp.scale, y: (sy - vp.y) / vp.scale };
    }

    function onPointerDown(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const world = screenToWorld(sx, sy);
      const hit = findNodeAt(sx, sy);

      if (hit) {
        dragRef.current = {
          nodeId: hit.id,
          startX: sx,
          startY: sy,
          nodeStartX: hit.x,
          nodeStartY: hit.y,
          moved: false,
        };
      } else {
        // Pan
        panRef.current = {
          active: true,
          startX: sx,
          startY: sy,
          vpStartX: viewportRef.current.x,
          vpStartY: viewportRef.current.y,
        };
        setSelectedNode(null);
      }
    }

    function onPointerMove(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragRef.current.nodeId) {
        const dx = sx - dragRef.current.startX;
        const dy = sy - dragRef.current.startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
          dragRef.current.moved = true;
        }
        const vp = viewportRef.current;
        setNodes(prev => prev.map(n =>
          n.id === dragRef.current.nodeId
            ? { ...n, x: dragRef.current.nodeStartX + dx / vp.scale, y: dragRef.current.nodeStartY + dy / vp.scale }
            : n
        ));
      } else if (panRef.current.active) {
        const dx = sx - panRef.current.startX;
        const dy = sy - panRef.current.startY;
        viewportRef.current = {
          ...viewportRef.current,
          x: panRef.current.vpStartX + dx,
          y: panRef.current.vpStartY + dy,
        };
      }
    }

    function onPointerUp(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragRef.current.nodeId && !dragRef.current.moved) {
        const hit = findNodeAt(sx, sy);
        if (hit) {
          if (connectMode && connectFrom && hit.id !== connectFrom) {
            connectNodes(connectFrom, hit.id);
            setConnectMode(false);
            setConnectFrom(null);
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
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

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

  // ─── Reset View ────────────────────────────────────────
  const resetView = useCallback(() => {
    viewportRef.current = { x: 0, y: 0, scale: 1 };
  }, []);

  // ─── Render UI ─────────────────────────────────────────
  const levelInfo = getBrainLevel(brainStats.totalKnowledge);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-[#050508] overflow-hidden" style={{ fontFamily: "'Space Mono', monospace" }}>
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-10"
        style={{ touchAction: 'none' }}
      />

      {/* ─── Top Bar ─────────────────────────────────── */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center gap-2 px-3 py-2.5 bg-[rgba(5,5,8,0.9)] backdrop-blur-xl border-b border-white/[0.06]">
        <div className="flex items-center gap-2 mr-2">
          <span className="text-[#00ffe0] font-bold text-lg" style={{ fontFamily: 'Syne, sans-serif' }}>
            Mind<span className="text-[#ff3cac]">Flow</span>
          </span>
          <span className="text-[#f5c400] text-xl">{levelInfo.emoji}</span>
        </div>

        {/* Topic buttons */}
        <div className="flex gap-1.5 overflow-x-auto flex-1 scrollbar-hide py-1">
          {Object.entries(KNOWLEDGE_BASE).map(([key, topic]) => (
            <button
              key={key}
              onClick={() => expandTopic(key)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.04] text-white/50 text-xs hover:bg-[rgba(0,255,224,0.12)] hover:text-[#00ffe0] hover:border-[rgba(0,255,224,0.4)] transition-all"
              style={{ fontFamily: 'Space Mono, monospace' }}
            >
              {topic.emoji} {topic.label}
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-1.5 flex-shrink-0">
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <button className="px-3 py-1.5 rounded-lg bg-[#ff6b9d] text-black font-bold text-xs" style={{ fontFamily: 'Syne, sans-serif' }}>
                + عقدة
              </button>
            </DialogTrigger>
            <DialogContent className="bg-[#0d0d14] border-white/10 text-white max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-[#00ffe0] text-right" style={{ fontFamily: 'Syne, sans-serif' }}>
                  إضافة عقدة جديدة
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-xs text-white/40 mb-1 block text-right">الاسم</label>
                  <Input
                    value={newLabel}
                    onChange={e => setNewLabel(e.target.value)}
                    placeholder="اسم العقدة..."
                    className="bg-white/[0.05] border-white/10 text-white text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block text-right">التصنيف</label>
                  <Input
                    value={newTag}
                    onChange={e => setNewTag(e.target.value)}
                    placeholder="تصنيف العقدة..."
                    className="bg-white/[0.05] border-white/10 text-white text-right"
                    dir="rtl"
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 mb-1 block text-right">الوصف</label>
                  <Textarea
                    value={newSummary}
                    onChange={e => setNewSummary(e.target.value)}
                    placeholder="وصف مختصر..."
                    className="bg-white/[0.05] border-white/10 text-white text-right min-h-[60px]"
                    dir="rtl"
                  />
                </div>
                <Button
                  onClick={addCustomNode}
                  className="w-full bg-[#00ffe0] text-black font-bold hover:bg-[#00ffe0]/80"
                  disabled={!newLabel.trim()}
                >
                  أضف وأطعم العقل 🧠
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <button
            onClick={() => setShowStats(!showStats)}
            className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-white/50 text-xs hover:text-[#f5c400] hover:border-[rgba(245,196,0,0.4)] transition-all"
          >
            📊
          </button>
        </div>
      </div>

      {/* ─── Stats Panel ──────────────────────────────── */}
      {showStats && (
        <div className="fixed top-14 right-3 z-50 w-64 bg-[rgba(10,10,20,0.95)] backdrop-blur-xl border border-white/10 rounded-xl p-4 space-y-3" dir="rtl">
          <div className="flex items-center justify-between">
            <span className="text-[#f5c400] font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif' }}>
              🧠 حالة العقل
            </span>
            <Badge variant="outline" className="text-[#f5c400] border-[#f5c400]/30 text-[10px]">
              المستوى {levelInfo.level} — {levelInfo.name}
            </Badge>
          </div>

          {/* Knowledge progress bar */}
          <div>
            <div className="flex justify-between text-[10px] text-white/40 mb-1">
              <span>المعرفة</span>
              <span>{brainStats.totalKnowledge}</span>
            </div>
            <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-1000"
                style={{
                  width: `${Math.min(100, (brainStats.totalKnowledge % 300) / 3)}%`,
                  background: 'linear-gradient(90deg, #f5c400, #00ffe0)',
                }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-white/[0.03] rounded-lg p-2 text-center">
              <div className="text-[#00ffe0] font-bold text-lg">{brainStats.totalNodes}</div>
              <div className="text-white/30 text-[10px]">العقد</div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2 text-center">
              <div className="text-[#ff6b9d] font-bold text-lg">{brainStats.totalConnections}</div>
              <div className="text-white/30 text-[10px]">الروابط</div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2 text-center">
              <div className="text-[#f5c400] font-bold text-lg">{brainStats.totalFeeds}</div>
              <div className="text-white/30 text-[10px]">التغذيات</div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2 text-center">
              <div className="text-[#a78bfa] font-bold text-lg">{brainStats.growthRate}%</div>
              <div className="text-white/30 text-[10px]">معدل النمو</div>
            </div>
          </div>

          {/* Explored topics */}
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

      {/* ─── Selected Node Panel ──────────────────────── */}
      {selectedNode && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[340px] max-w-[90vw] bg-[rgba(10,10,20,0.95)] backdrop-blur-xl border border-white/10 rounded-xl p-4" dir="rtl">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-bold text-sm" style={{ fontFamily: 'Syne, sans-serif', color: selectedNode.isBrain ? '#f5c400' : selectedNode.isCustom ? '#ff6b9d' : selectedNode.color }}>
                {selectedNode.isBrain ? '🧠' : ''} {selectedNode.label}
              </h3>
              <Badge variant="outline" className="text-[10px] mt-1" style={{
                color: selectedNode.color,
                borderColor: selectedNode.color + '40',
              }}>
                {selectedNode.tag}
              </Badge>
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="text-white/30 hover:text-white/60 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {selectedNode.summary && (
            <p className="text-white/50 text-xs mb-3 leading-relaxed">{selectedNode.summary}</p>
          )}

          {/* Knowledge level */}
          {!selectedNode.isBrain && (
            <div className="mb-3">
              <div className="flex justify-between text-[10px] text-white/30 mb-1">
                <span>مستوى المعرفة</span>
                <span>{selectedNode.knowledgeLevel}%</span>
              </div>
              <div className="h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${selectedNode.knowledgeLevel}%`,
                    background: selectedNode.color,
                  }}
                />
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {!selectedNode.isBrain && (
              <button
                onClick={() => feedBrain(selectedNode.id)}
                className="flex-1 px-3 py-2 rounded-lg bg-[rgba(245,196,0,0.12)] text-[#f5c400] border border-[rgba(245,196,0,0.3)] text-xs font-bold hover:bg-[rgba(245,196,0,0.2)] transition-all"
              >
                🍎 أطعم العقل
              </button>
            )}
            {selectedNode.hasChildren && (
              <button
                onClick={() => expandNode(selectedNode.id)}
                className="flex-1 px-3 py-2 rounded-lg bg-[rgba(0,255,224,0.12)] text-[#00ffe0] border border-[rgba(0,255,224,0.3)] text-xs font-bold hover:bg-[rgba(0,255,224,0.2)] transition-all"
              >
                {selectedNode.expanded ? '↺ أغلق' : '⊕ توسع'}
              </button>
            )}
            {!selectedNode.isBrain && (
              <button
                onClick={() => {
                  if (connectMode && connectFrom === selectedNode.id) {
                    setConnectMode(false);
                    setConnectFrom(null);
                  } else {
                    setConnectMode(true);
                    setConnectFrom(selectedNode.id);
                  }
                }}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                  connectMode && connectFrom === selectedNode.id
                    ? 'bg-[rgba(255,107,157,0.2)] text-[#ff6b9d] border border-[rgba(255,107,157,0.4)]'
                    : 'bg-white/[0.04] text-white/50 border border-white/10 hover:text-[#ff6b9d]'
                }`}
              >
                🔗 ربط
              </button>
            )}
            {!selectedNode.isBrain && (
              <button
                onClick={() => deleteNode(selectedNode.id)}
                className="px-3 py-2 rounded-lg bg-white/[0.04] text-white/30 border border-white/10 text-xs hover:text-red-400 hover:border-red-400/30 transition-all"
              >
                ✕
              </button>
            )}
          </div>

          {/* Connections */}
          {selectedNode.connections.length > 0 && (
            <div className="mt-3 pt-2 border-t border-white/[0.06]">
              <div className="text-white/30 text-[10px] mb-1">متصل بـ</div>
              <div className="flex flex-wrap gap-1">
                {selectedNode.connections.map(cid => {
                  const connected = nodes.find(n => n.id === cid);
                  if (!connected) return null;
                  return (
                    <span key={cid} className="text-[9px] px-2 py-0.5 rounded-full bg-white/[0.04] text-white/40 border border-white/[0.06]">
                      {connected.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Connect Mode Banner ──────────────────────── */}
      {connectMode && connectFrom && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgba(255,107,157,0.15)] backdrop-blur-xl border border-[rgba(255,107,157,0.3)] rounded-full text-[#ff6b9d] text-xs" dir="rtl">
          🔗 وضع الربط — اضغط على عقدة أخرى للربط
          <button
            onClick={() => { setConnectMode(false); setConnectFrom(null); }}
            className="mr-2 text-white/30 hover:text-white/60"
          >
            ✕ إلغاء
          </button>
        </div>
      )}

      {/* ─── Feed Animation Toast ──────────────────────── */}
      {feedAnim && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-[rgba(245,196,0,0.15)] backdrop-blur-xl border border-[rgba(245,196,0,0.3)] rounded-full text-[#f5c400] text-xs animate-bounce" dir="rtl">
          🍎 العقل يتغذى!
        </div>
      )}

      {/* ─── Bottom Hint ──────────────────────────────── */}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-40 text-[10px] text-white/20 bg-[rgba(5,5,8,0.75)] backdrop-blur-xl px-4 py-1.5 rounded-full border border-white/[0.06]" dir="rtl">
        اضغط على عقدة · اسحب للتحريك · عجلة للتكبير · اختر موضوع لبدء التغذية
      </div>

      {/* ─── Brain Level Badge ────────────────────────── */}
      <div className="fixed bottom-3 right-3 z-40 flex items-center gap-2 px-3 py-1.5 bg-[rgba(10,10,20,0.9)] backdrop-blur-xl border border-[rgba(245,196,0,0.2)] rounded-full" dir="rtl">
        <span className="text-lg">{levelInfo.emoji}</span>
        <div>
          <div className="text-[#f5c400] text-[11px] font-bold" style={{ fontFamily: 'Syne, sans-serif' }}>
            {levelInfo.name}
          </div>
          <div className="text-white/20 text-[9px]">مستوى {levelInfo.level}</div>
        </div>
      </div>

      {/* ─── Reset View Button ────────────────────────── */}
      <button
        onClick={resetView}
        className="fixed bottom-3 left-3 z-40 px-3 py-1.5 bg-[rgba(10,10,20,0.9)] backdrop-blur-xl border border-white/10 rounded-full text-white/30 text-xs hover:text-white/60 transition-all"
      >
        ⟳ إعادة العرض
      </button>
    </div>
  );
}
