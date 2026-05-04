---
Task ID: 1
Agent: Main Agent
Task: Build MindFlow Brain - Interactive Knowledge Graph with Learning Brain

Work Log:
- Analyzed original index.html MindFlow project (vanilla JS knowledge graph)
- Designed and implemented complete MindFlow Brain application as Next.js web app
- Created type system (src/lib/mindflow/types.ts)
- Created knowledge base with 6 topics and cross-linking rules (src/lib/mindflow/knowledge.ts)
- Built comprehensive main page component with:
  - Central Brain node (العقل) that pulses and grows
  - Canvas-based graph rendering with animated edges and feed particles
  - Topic expansion with auto-feeding to the brain
  - Sub-node expansion (click to expand/collapse)
  - Custom node creation dialog (add name, tag, summary)
  - Cross-linking system (auto-links nodes with matching tags)
  - Manual connect mode (click two nodes to link them)
  - Feed brain mechanic (particles flow from node to brain)
  - Brain level system (بذرة → برعم → شتلة → شجرة → غابة → نظام بيئي → كوكب → مجرة → كون)
  - Statistics panel (total nodes, connections, feeds, growth rate, knowledge progress)
  - Node selection panel with actions (feed, expand, connect, delete)
  - LocalStorage persistence for brain stats and custom nodes
  - Responsive canvas with pan and zoom support
- Updated layout.tsx with Arabic RTL support and custom fonts
- Fixed lint errors (function declaration order, setState in effects)
- Verified successful compilation

Stage Summary:
- Complete MindFlow Brain web application built and running
- Key features: Brain node, feed mechanic, cross-linking, custom nodes, persistence, levels
- All 7 todo items completed
- App accessible via preview link
