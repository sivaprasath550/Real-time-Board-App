"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Circle,
  Clock,
  Bot,
  Copy,
  CopyPlus,
  Download,
  Highlighter,
  Layers,
  LogOut,
  MousePointer2,
  Pencil,
  Redo2,
  Sparkles,
  Square,
  StickyNote,
  Star,
  Trash2,
  Type,
  Undo2,
  UserPlus,
  Wifi,
  HelpCircle,
  Wand2,
  Mic,
  Users,
  Plus,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { AiBotPanel } from "@/components/ai/ai-bot-panel";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

export type Tool = "select" | "pencil" | "highlighter" | "text" | "sticky" | "rect" | "circle" | "image";

export type DrawItem = {
  id: string;
  type: "pencil" | "text" | "sticky" | "rect" | "circle" | "html" | "image";
  x: number;
  y: number;
  w?: number;
  h?: number;
  color: string;
  text?: string;
  htmlContent?: string;
  base64?: string; // for image type
  points?: Array<{ x: number; y: number }>;
  strokeWidth?: number;
  opacity?: number;
};

export type BoardPage = { id: string; name: string; objects: DrawItem[]; background?: string };

export type BoardState = {
  objects: DrawItem[]; // Legacy / Current Slide objects
  pages?: BoardPage[];
  activePageId?: string;
};

type ShapeDraft = {
  kind: "rect" | "circle";
  color: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
};

const COLORS = ["#e8eaef", "#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7"];

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function cloneItem(o: DrawItem): DrawItem {
  return JSON.parse(JSON.stringify(o)) as DrawItem;
}

function templateBrainstorm(): DrawItem[] {
  const stickies = ["#fde68a", "#bbf7d0", "#bfdbfe", "#fecaca", "#e9d5ff"];
  const items: DrawItem[] = [
    {
      id: newId(),
      type: "text",
      x: 48,
      y: 36,
      color: "#e8eaef",
      text: "Brainstorm",
    },
  ];
  stickies.forEach((bg, i) => {
    items.push({
      id: newId(),
      type: "sticky",
      x: 56 + i * 168,
      y: 140,
      w: 148,
      h: 118,
      color: bg,
      text: `Idea ${i + 1}`,
    });
  });
  return items;
}

function templateRetro(): DrawItem[] {
  return [
    { id: newId(), type: "text", x: 48, y: 32, color: "#a5b4fc", text: "Sprint retro" },
    { id: newId(), type: "sticky", x: 56, y: 100, w: 200, h: 100, color: "#fecaca", text: "Went well" },
    { id: newId(), type: "sticky", x: 280, y: 100, w: 200, h: 100, color: "#fde68a", text: "To improve" },
    { id: newId(), type: "sticky", x: 504, y: 100, w: 200, h: 100, color: "#bbf7d0", text: "Action items" },
  ];
}

function templateSprint(): DrawItem[] {
  return [
    { id: newId(), type: "text", x: 48, y: 32, color: "#e8eaef", text: "Sprint board" },
    { id: newId(), type: "rect", x: 48, y: 96, w: 220, h: 160, color: "#6366f1" },
    { id: newId(), type: "text", x: 64, y: 112, color: "#c7d2fe", text: "To do" },
    { id: newId(), type: "rect", x: 292, y: 96, w: 220, h: 160, color: "#22c55e" },
    { id: newId(), type: "text", x: 308, y: 112, color: "#bbf7d0", text: "Doing" },
    { id: newId(), type: "rect", x: 536, y: 96, w: 220, h: 160, color: "#f59e0b" },
    { id: newId(), type: "text", x: 552, y: 112, color: "#fde68a", text: "Done" },
  ];
}

export function WorkspaceApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<{ id: string; email: string; name: string } | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isRegister, setIsRegister] = useState(true);
  const [authError, setAuthError] = useState("");

  const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
  const [orgId, setOrgId] = useState("");
  const [orgName, setOrgName] = useState("Acme Studio");
  const [boards, setBoards] = useState<Array<{ id: string; title: string; isFavorite: boolean; updatedAt: string }>>([]);
  const [boardId, setBoardId] = useState("");
  const [boardTitle, setBoardTitle] = useState("Untitled board");
  const [board, setBoard] = useState<BoardState>({ objects: [] });
  
  // Board Decks (Slides) State
  const [deckPages, setDeckPages] = useState<BoardPage[]>([{ id: "slide-1", name: "Slide 1", objects: [] }]);
  const [activePageId, setActivePageId] = useState("slide-1");
  const [exportingPDF, setExportingPDF] = useState(false);

  const [tool, setTool] = useState<Tool>("pencil");
  const [color, setColor] = useState(COLORS[0]);
  const [undoStack, setUndoStack] = useState<BoardState[]>([]);
  const [redoStack, setRedoStack] = useState<BoardState[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [lastSyncText, setLastSyncText] = useState("—");
  const [aiOpen, setAiOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftStroke, setDraftStroke] = useState<DrawItem | null>(null);
  const [shapeDraft, setShapeDraft] = useState<ShapeDraft | null>(null);
  const [inviteModal, setInviteModal] = useState<{ link: string; email: string; message: string } | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  
  // AI Demo State
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [isAutoCollab, setIsAutoCollab] = useState(false);
  const [aiWorking, setAiWorking] = useState(false);
  
  const [cursors, setCursors] = useState<Record<string, { x: number, y: number, name: string, lastUpdate: number }>>({});
  const lastCursorEmit = useRef(0);

  
  const draftStrokeRef = useRef<DrawItem | null>(null);
  const shapeDraftRef = useRef<ShapeDraft | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef(board);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastServerTimeRef = useRef(0);
  const boardJsonRef = useRef(JSON.stringify({ objects: [] } as BoardState));
  const savingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imagePlacementRef = useRef<{ x: number; y: number } | null>(null);
  
  const deckPagesRef = useRef<BoardPage[]>([{ id: "slide-1", name: "Slide 1", objects: [] }]);
  const activePageIdRef = useRef("slide-1");

  const persist = useCallback(
    async (next: BoardState) => {
      if (!boardId) return;
      savingRef.current = true;
      try {
        const currentDeck = [...deckPagesRef.current];
        const pageIdx = currentDeck.findIndex(p => p.id === activePageIdRef.current);
        if (pageIdx > -1) currentDeck[pageIdx].objects = next.objects;
        else currentDeck.push({ id: activePageIdRef.current, name: "Slide", objects: next.objects });
        
        const stateToSave: BoardState = { objects: next.objects, pages: currentDeck, activePageId: activePageIdRef.current };

        const res = await fetch(`/api/boards/${boardId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stateJson: JSON.stringify(stateToSave), title: boardTitle }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { board: { updatedAt: string } };
        lastServerTimeRef.current = new Date(data.board.updatedAt).getTime();
        setLastSyncText(`Saved ${new Date().toLocaleTimeString()}`);
        channelRef.current?.postMessage({ boardId, payload: stateToSave });
      } finally {
        savingRef.current = false;
      }
    },
    [boardId, boardTitle],
  );

  // === AI FEATURE ACTIONS ===
  const runAiAction = async (action: string, payload: any) => {
    setAiWorking(true);
    setToast(`Running AI: ${action}...`);
    try {
      const res = await fetch("/api/ai/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, payload })
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error || "AI failed");
        return null;
      }
      setToast("AI magic complete!");
      return data.result;
    } finally {
      setAiWorking(false);
    }
  };

  const handleMindmapExplosion = async () => {
    if (!selectedId) return;
    const note = board.objects.find(o => o.id === selectedId);
    if (!note || note.type !== 'sticky') return;
    
    const concepts = await runAiAction("mindmap", { topic: note.text });
    if (!concepts || !Array.isArray(concepts)) return;
    
    setBoard(b => {
      const newObjs: DrawItem[] = [...b.objects];
      const radius = 250;
      const angleStep = (Math.PI * 2) / concepts.length;
      
      concepts.forEach((concept: string, idx: number) => {
        const cx = note.x + (note.w || 160)/2;
        const cy = note.y + (note.h || 130)/2;
        const nx = cx + radius * Math.cos(idx * angleStep) - 80;
        const ny = cy + radius * Math.sin(idx * angleStep) - 65;
        
        newObjs.push({
          id: newId(),
          type: "sticky",
          x: nx, y: ny, w: 160, h: 130,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          text: concept
        });
        
        // Add connecting line (as pencil stroke)
        newObjs.push({
          id: newId(),
          type: "pencil",
          x: 0, y: 0,
          color: "#9ca3af",
          strokeWidth: 4,
          opacity: 0.6,
          points: [{ x: cx, y: cy }, { x: nx + 80, y: ny + 65 }]
        });
      });
      
      const next = { objects: newObjs };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
  };

  const handleSemanticGrouping = async () => {
    const notes = board.objects.filter(o => o.type === "sticky" || o.type === "text").map(o => ({ id: o.id, text: o.text || "" }));
    if (notes.length === 0) return;
    
    const themes = await runAiAction("organize", { notes });
    if (!themes || !Array.isArray(themes)) return;
    
    setBoard(b => {
      const newObjs = [...b.objects];
      let startX = 50;
      
      themes.forEach((theme: any) => {
        newObjs.push({
          id: newId(),
          type: "text",
          x: startX,
          y: 50,
          color: "#a5b4fc",
          text: theme.themeName.toUpperCase()
        });
        
        let currentY = 100;
        theme.noteIds.forEach((id: string) => {
          const idx = newObjs.findIndex(o => o.id === id);
          if (idx > -1) {
            newObjs[idx] = { ...newObjs[idx], x: startX, y: currentY };
            currentY += (newObjs[idx].h || 130) + 20;
          }
        });
        
        startX += 300;
      });
      
      const next = { objects: newObjs };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
  };

  const generateUI = async () => {
    if (!selectedId) return;
    const stroke = board.objects.find(o => o.id === selectedId);
    if (!stroke || stroke.type !== 'pencil') return;
    
    const pts = stroke.points || [];
    if (pts.length === 0) return;
    let minX = pts[0].x, maxX = pts[0].x, minY = pts[0].y, maxY = pts[0].y;
    pts.forEach(p => {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    const paths = pts.map(p => `${p.x-stroke.x},${p.y-stroke.y}`).join(" ");
    const svgStr = `<svg viewBox="0 0 ${maxX-minX+50} ${maxY-minY+50}"><polyline points="${paths}" fill="none" stroke="black" stroke-width="2"/></svg>`;
    
    const html = await runAiAction("vision", { svg: svgStr });
    if (!html) return;
    
    setBoard(b => {
      const nextObjs = b.objects.filter(o => o.id !== stroke.id);
      nextObjs.push({
        id: newId(),
        type: "html",
        x: stroke.x,
        y: stroke.y,
        w: Math.max(300, maxX - minX),
        h: Math.max(200, maxY - minY),
        color: "#ffffff",
        htmlContent: html
      });
      const next = { objects: nextObjs };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
  };

  useEffect(() => {
    if (!isAutoCollab) return;
    const interval = setInterval(async () => {
      const isSkeptic = Math.random() > 0.5;
      const history = boardRef.current.objects.filter(o => o.type === 'sticky').map(o => o.text || "");
      if (history.length === 0) return;
      
      const res = await fetch("/api/ai/action", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "debate", payload: { history, isSkeptic } })
      });
      if (!res.ok) return;
      const data = await res.json();
      
      setBoard(b => {
        const newObjs = [...b.objects];
        newObjs.push({
          id: newId(), type: "sticky",
          x: 100 + Math.random() * 600,
          y: 100 + Math.random() * 400,
          w: 160, h: 130,
          color: isSkeptic ? "#fca5a5" : "#e9d5ff",
          text: `[${isSkeptic ? "Skeptic" : "Visionary"}]: ${data.result}`
        });
        const next = { objects: newObjs };
        setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
        setRedoStack([]);
        void persist(next);
        return next;
      });
    }, 12000);
    return () => clearInterval(interval);
  }, [isAutoCollab, persist]);

  useEffect(() => {
    if (!isVoiceActive) return;
    // @ts-ignore
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setToast("Speech Recognition not supported in this browser");
      setIsVoiceActive(false);
      return;
    }
    const recognition = new SpeechRec();
    recognition.continuous = true;
    recognition.interimResults = false;
    
    recognition.onresult = async (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      const text = transcript.toLowerCase();
      if (!text.includes("boardbot") && !text.includes("board bot") && !text.includes("board part") && !text.includes("bird bot")) return;
      
      const aiData = await runAiAction("voice", { transcript });
      if (!aiData) return;
      
      setBoard(b => {
        const newObjs = [...b.objects];
        if (aiData.action === "pros_cons") {
           newObjs.push({ id: newId(), type: "text", x: 600, y: 50, color: "#a5b4fc", text: aiData.topic?.toUpperCase() || "PROS & CONS" });
           let px = 600, py = 100;
           (aiData.pros || []).forEach((t: string) => {
             newObjs.push({ id: newId(), type: "sticky", x: px, y: py, w: 160, h: 100, color: "#bbf7d0", text: t });
             py += 120;
           });
           let cx = 800, cy = 100;
           (aiData.cons || []).forEach((t: string) => {
             newObjs.push({ id: newId(), type: "sticky", x: cx, y: cy, w: 160, h: 100, color: "#fecaca", text: t });
             cy += 120;
           });
        } else {
           newObjs.push({ id: newId(), type: "sticky", x: 400, y: 300, w: 200, h: 150, color: "#bfdbfe", text: aiData.text || "Voice action complete." });
        }
        const next = { objects: newObjs };
        setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
        setRedoStack([]);
        void persist(next);
        return next;
      });
    };
    
    recognition.start();
    return () => recognition.stop();
  }, [isVoiceActive, persist]);
  // === END AI FEATURES ===

  const snapshot = useCallback((s: BoardState) => JSON.parse(JSON.stringify(s)) as BoardState, []);

  useEffect(() => {
    boardJsonRef.current = JSON.stringify(board);
    boardRef.current = board;
  }, [board]);

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user));
  }, []);

  const refreshOrgs = useCallback(async () => {
    const res = await fetch("/api/orgs");
    if (!res.ok) return;
    const data = (await res.json()) as { organizations: Array<{ id: string; name: string }> };
    setOrgs(data.organizations);
    setOrgId((current) => current || data.organizations[0]?.id || "");
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshOrgs();
  }, [user, refreshOrgs]);

  const loadBoards = useCallback(async () => {
    if (!orgId) return;
    const res = await fetch(`/api/boards?organizationId=${orgId}`);
    const data = await res.json();
    setBoards(data.boards ?? []);
  }, [orgId]);

  useEffect(() => {
    if (!user || !orgId) return;
    void loadBoards();
  }, [user, orgId, loadBoards]);

  useEffect(() => {
    channelRef.current = new BroadcastChannel("board-sync");
    channelRef.current.onmessage = (event) => {
      if (event.data?.boardId !== boardId) return;
      
      if (event.data.type === "cursor") {
        // Show cursor if on same slide OR sender has no slideId yet (just joined)
        if (event.data.slideId && event.data.slideId !== activePageIdRef.current) return;
        setCursors(prev => ({
          ...prev,
          [event.data.userId]: { x: event.data.x, y: event.data.y, name: event.data.name, slideId: event.data.slideId, lastUpdate: Date.now() }
        }));
        return;
      }
      const payload = event.data.payload as BoardState;
      if (payload.pages && payload.pages.length > 0) {
        deckPagesRef.current = payload.pages;
        setDeckPages(payload.pages);
        
        const act = payload.pages.find(p => p.id === activePageIdRef.current);
        if (act) {
          setBoard({ objects: act.objects });
          boardJsonRef.current = JSON.stringify({ objects: act.objects });
        }
      } else {
        const incoming = JSON.stringify(payload);
        if (incoming === boardJsonRef.current) return;
        try {
          const previous = JSON.parse(boardJsonRef.current) as BoardState;
          setUndoStack((u) => [...u.slice(-49), snapshot(previous)]);
          setRedoStack([]);
          setBoard(payload);
          boardJsonRef.current = incoming;
          setLastSyncText(`Teammate update ${new Date().toLocaleTimeString()}`);
        } catch {
          setBoard(payload);
          boardJsonRef.current = incoming;
        }
      }
    };
    return () => channelRef.current?.close();
  }, [boardId, snapshot]);

  // Remote Multiplayer Cursor Sync
  useEffect(() => {
    if (!boardId || !user?.id) return;
    
    const id = setInterval(async () => {
      try {
        const res = await fetch(`/api/cursors?boardId=${boardId}`);
        if (!res.ok) return;
        const data = await res.json();
        const remoteCursors = data.cursors || {};
        
        setCursors(prev => {
          let hasChanges = false;
          const next = { ...prev };
          const now = Date.now();
          
          Object.entries(remoteCursors).forEach(([uid, remoteData]: any) => {
            // Don't draw our own cursor; show cross-slide only if slideId matches (or remote has none yet)
            if (uid === user.id) return;
            if (remoteData.slideId && remoteData.slideId !== activePageIdRef.current) return;
            const current = next[uid];
            if (!current || remoteData.lastUpdate > current.lastUpdate) {
              next[uid] = remoteData;
              hasChanges = true;
            }
          });
          
          // Cleanup stale local cursors
          for (const [k, v] of Object.entries(next)) {
            if (now - v.lastUpdate > 8000) { delete next[k]; hasChanges = true; }
          }
          
          return hasChanges ? next : prev;
        });
      } catch (err) {}
    }, 200);
    return () => clearInterval(id);
  }, [boardId, user]);

  useEffect(() => {
    if (!boardId) return;
    const id = window.setInterval(async () => {
      if (savingRef.current) return;
      try {
        const r = await fetch(`/api/boards/${boardId}`);
        if (!r.ok) return;
        const d = (await r.json()) as { board: { updatedAt: string; stateJson: string } };
        const t = new Date(d.board.updatedAt).getTime();
        const remote = d.board.stateJson;
        if (remote === boardJsonRef.current) {
          lastServerTimeRef.current = Math.max(lastServerTimeRef.current, t);
          return;
        }
        if (t > lastServerTimeRef.current) {
          lastServerTimeRef.current = t;
          try {
            const parsed = JSON.parse(remote) as BoardState;
            if (parsed.pages && parsed.pages.length > 0) {
              deckPagesRef.current = parsed.pages;
              setDeckPages(parsed.pages);
              
              const pIdx = parsed.pages.findIndex(p => p.id === activePageIdRef.current);
              if (pIdx > -1) {
                setBoard({ objects: parsed.pages[pIdx].objects });
                boardJsonRef.current = JSON.stringify({ objects: parsed.pages[pIdx].objects });
              }
            } else {
              const previous = JSON.parse(boardJsonRef.current) as BoardState;
              setUndoStack((u) => [...u.slice(-49), snapshot(previous)]);
              setRedoStack([]);
              setBoard(parsed);
              boardJsonRef.current = remote;
            }
            setLastSyncText(`Synced ${new Date().toLocaleTimeString()}`);
          } catch {
            /* ignore malformed */
          }
        }
      } catch {
        /* ignore */
      }
    }, 650);
    return () => window.clearInterval(id);
  }, [boardId, snapshot]);

  const openBoard = useCallback(
    async (id: string) => {
      setSelectedId(null);
      setEditingId(null);
      const res = await fetch(`/api/boards/${id}`);
      if (!res.ok) {
        router.replace("/", { scroll: false });
        setToast("Board not found or no access");
        window.setTimeout(() => setToast(null), 3200);
        return;
      }
      setUndoStack([]);
      setRedoStack([]);
      setBoardId(id);
      const data = await res.json();
      const state = JSON.parse(data.board.stateJson) as BoardState;
      
      if (state.pages && state.pages.length > 0) {
        deckPagesRef.current = state.pages;
        activePageIdRef.current = state.activePageId || state.pages[0].id;
        
        setDeckPages(state.pages);
        setActivePageId(activePageIdRef.current);
        
        const actP = state.pages.find(p => p.id === activePageIdRef.current) || state.pages[0];
        setBoard({ objects: actP.objects });
        boardJsonRef.current = JSON.stringify({ objects: actP.objects });
      } else {
        // Legacy fallback
        const legacyPageId = newId();
        deckPagesRef.current = [{ id: legacyPageId, name: "Slide 1", objects: state.objects || [] }];
        activePageIdRef.current = legacyPageId;
        setDeckPages(deckPagesRef.current);
        setActivePageId(legacyPageId);
        
        setBoard({ objects: state.objects || [] });
        boardJsonRef.current = JSON.stringify({ objects: state.objects || [] });
      }
      
      lastServerTimeRef.current = new Date(data.board.updatedAt).getTime();
      router.replace(`/?board=${id}`, { scroll: false });
      setLastSyncText(`Opened ${new Date().toLocaleTimeString()}`);
    },
    [router],
  );

  useEffect(() => {
    const q = searchParams.get("board");
    if (!user || !q || q === boardId) return;
    void openBoard(q);
  }, [user, searchParams, boardId, openBoard]);

  useEffect(() => {
    if (!boardId || !user) return;
    const h = window.setTimeout(() => {
      void (async () => {
        const res = await fetch(`/api/boards/${boardId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: boardTitle }),
        });
        if (res.ok) {
          const data = (await res.json()) as { board?: { updatedAt: string } };
          if (data.board?.updatedAt) {
            lastServerTimeRef.current = new Date(data.board.updatedAt).getTime();
          }
          void loadBoards();
        }
      })();
    }, 450);
    return () => window.clearTimeout(h);
  }, [boardTitle, boardId, user, loadBoards]);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (!stack.length) return stack;
      const nextBoard = stack[stack.length - 1];
      const rest = stack.slice(0, -1);
      const current = snapshot(boardRef.current);
      setRedoStack((r) => [...r, current]);
      setBoard(nextBoard);
      boardJsonRef.current = JSON.stringify(nextBoard);
      void persist(nextBoard);
      return rest;
    });
  }, [persist, snapshot]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (!stack.length) return stack;
      const nextBoard = stack[stack.length - 1];
      const rest = stack.slice(0, -1);
      const current = snapshot(boardRef.current);
      setUndoStack((u) => [...u, current]);
      setBoard(nextBoard);
      boardJsonRef.current = JSON.stringify(nextBoard);
      void persist(nextBoard);
      return rest;
    });
  }, [persist, snapshot]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedId) return;
        e.preventDefault();
        setBoard((b) => {
          const next = { objects: b.objects.filter((o) => o.id !== selectedId) };
          setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
          setRedoStack([]);
          setSelectedId(null);
          void persist(next);
          return next;
        });
        return;
      }
      if (e.key === "?" && e.shiftKey) {
        e.preventDefault();
        setShowHelp((h) => !h);
        return;
      }
      if (e.key.toLowerCase() === "a") {
        e.preventDefault();
        setAiOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "z" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (e.shiftKey) void redo();
        else void undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!selectedId) return;
        setBoard((b) => {
          const o = b.objects.find((x) => x.id === selectedId);
          if (!o) return b;
          const copy = { ...cloneItem(o), id: newId(), x: o.x + 20, y: o.y + 20 };
          const next = { objects: [...b.objects, copy] };
          setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
          setRedoStack([]);
          void persist(next);
          return next;
        });
        return;
      }
      if (e.key.toLowerCase() === "p") setTool("pencil");
      if (e.key.toLowerCase() === "h") setTool("highlighter");
      if (e.key.toLowerCase() === "v") setTool("select");
      if (e.key.toLowerCase() === "t") setTool("text");
      if (e.shiftKey) {
        if (e.key.toLowerCase() === "s") setTool("sticky");
      }
      if (e.key.toLowerCase() === "r") setTool("rect");
      if (e.key.toLowerCase() === "c") setTool("circle");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [persist, redo, selectedId, undo, snapshot]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3200);
  };

  const auth = async () => {
    setAuthError("");
    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    const body = isRegister ? { email, password, name } : { email, password };
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setAuthError(typeof data.error === "string" ? data.error : "Request failed");
      return;
    }
    setUser(data.user);
  };

  const createOrg = async () => {
    const res = await fetch("/api/orgs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: orgName }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setOrgId(data.organization.id);
    await refreshOrgs();
    showToast("Organization created");
  };

  const createBoard = async () => {
    if (!orgId) {
      showToast("Select or create an organization first");
      return;
    }
    const res = await fetch("/api/boards", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: boardTitle, organizationId: orgId }),
    });
    if (!res.ok) return;
    const data = await res.json();
    setBoardId(data.board.id);
    setBoard({ objects: [] });
    lastServerTimeRef.current = new Date(data.board.updatedAt ?? Date.now()).getTime();
    boardJsonRef.current = JSON.stringify({ objects: [] });
    setUndoStack([]);
    setRedoStack([]);
    setSelectedId(null);
    router.replace(`/?board=${data.board.id}`, { scroll: false });
    await loadBoards();
    showToast("New board ready");
  };

  const addItem = useCallback(
    (item: DrawItem) => {
      setBoard((b) => {
        const next = { objects: [...b.objects, item] };
        setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
        setRedoStack([]);
        void persist(next);
        return next;
      });
    },
    [persist, snapshot],
  );

  const canvasPoint = (e: React.MouseEvent | MouseEvent) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onCanvasDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current || !boardId) return;
    if (tool === "select") {
      if (e.target === e.currentTarget) {
        setSelectedId(null);
        setEditingId(null);
      }
      return;
    }
    const { x, y } = canvasPoint(e);
    if (tool === "pencil") {
      const stroke = { id: newId(), type: "pencil" as const, x, y, color, points: [{ x, y }] };
      draftStrokeRef.current = stroke;
      setDraftStroke(stroke);
      return;
    }
    if (tool === "highlighter") {
      const stroke = {
        id: newId(),
        type: "pencil" as const,
        x,
        y,
        color,
        points: [{ x, y }],
        strokeWidth: 18,
        opacity: 0.42,
      };
      draftStrokeRef.current = stroke;
      setDraftStroke(stroke);
      return;
    }
    if (tool === "text") {
      addItem({ id: newId(), type: "text", x, y, color, text: "Double-click to edit" });
      return;
    }
    if (tool === "sticky") {
      addItem({
        id: newId(),
        type: "sticky",
        x,
        y,
        w: 160,
        h: 130,
        color: "#fde68a",
        text: "Note",
      });
      return;
    }
    if (tool === "rect" || tool === "circle") {
      const sh = { kind: tool, color, x0: x, y0: y, x1: x, y1: y };
      shapeDraftRef.current = sh;
      setShapeDraft(sh);
      return;
    }
    if (tool === "image") {
      // Store position for image placement then open file picker
      imagePlacementRef.current = { x, y };
      imageInputRef.current?.click();
    }
  };

  const onCanvasMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const { x, y } = canvasPoint(e);
    
    const now = Date.now();
    if (boardId && user && now - lastCursorEmit.current > 150) {
      lastCursorEmit.current = now;
      
      // Zero-latency cross-tab fallback
      channelRef.current?.postMessage({
        type: "cursor", boardId, userId: user.id, x, y, name: user.name, slideId: activePageIdRef.current
      });
      
      // Cross-network internet sync
      fetch("/api/cursors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ boardId, userId: user.id, x, y, name: user.name, slideId: activePageIdRef.current })
      }).catch(() => {});
    }

    if ((tool === "pencil" || tool === "highlighter") && draftStrokeRef.current) {
      setDraftStroke((d) => {
        if (!d) return d;
        const next = { ...d, points: [...(d.points ?? []), { x, y }] };
        draftStrokeRef.current = next;
        return next;
      });
    }
    if (shapeDraftRef.current) {
      setShapeDraft((d) => {
        if (!d) return d;
        const next = { ...d, x1: x, y1: y };
        shapeDraftRef.current = next;
        return next;
      });
    }
  };

  const endDraw = useCallback(() => {
    const ds = draftStrokeRef.current;
    const sh = shapeDraftRef.current;
    draftStrokeRef.current = null;
    shapeDraftRef.current = null;
    setDraftStroke(null);
    setShapeDraft(null);
    if (ds && (ds.points?.length ?? 0) > 1) {
      setBoard((b) => {
        const next = { objects: [...b.objects, ds] };
        setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
        setRedoStack([]);
        void persist(next);
        return next;
      });
    }
    if (sh) {
      const left = Math.min(sh.x0, sh.x1);
      const top = Math.min(sh.y0, sh.y1);
      const w = Math.abs(sh.x1 - sh.x0);
      const h = Math.abs(sh.y1 - sh.y0);
      if (w >= 6 && h >= 6) {
        const item: DrawItem = {
          id: newId(),
          type: sh.kind,
          x: left,
          y: top,
          w,
          h,
          color: sh.color,
        };
        setBoard((b) => {
          const next = { objects: [...b.objects, item] };
          setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
          setRedoStack([]);
          void persist(next);
          return next;
        });
      }
    }
  }, [persist, snapshot]);

  useEffect(() => {
    const up = () => endDraw();
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, [endDraw]);

  const onItemDown = (e: React.MouseEvent, id: string) => {
    if (tool !== "select") return;
    e.stopPropagation();
    setSelectedId(id);
    setEditingId(null);
  };

  const bringForward = () => {
    if (!selectedId) return;
    setBoard((b) => {
      const idx = b.objects.findIndex((o) => o.id === selectedId);
      if (idx < 0 || idx === b.objects.length - 1) return b;
      const objs = [...b.objects];
      [objs[idx], objs[idx + 1]] = [objs[idx + 1], objs[idx]];
      const next = { objects: objs };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
  };

  const sendBackward = () => {
    if (!selectedId) return;
    setBoard((b) => {
      const idx = b.objects.findIndex((o) => o.id === selectedId);
      if (idx <= 0) return b;
      const objs = [...b.objects];
      [objs[idx], objs[idx - 1]] = [objs[idx - 1], objs[idx]];
      const next = { objects: objs };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
  };

  const toggleFavorite = async (id: string, isFavorite: boolean) => {
    await fetch(`/api/boards/${id}/favorite`, { method: isFavorite ? "POST" : "DELETE" });
    await loadBoards();
  };

  const applyTemplate = (kind: "brainstorm" | "retro" | "sprint") => {
    if (!boardId) {
      showToast("Open a board first");
      return;
    }
    const extra = kind === "brainstorm" ? templateBrainstorm() : kind === "retro" ? templateRetro() : templateSprint();
    setBoard((b) => {
      const next = { objects: [...b.objects, ...extra] };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
    showToast("Template inserted — undo if you want it gone");
  };

  const exportBoardJson = () => {
    const blob = new Blob([JSON.stringify(board, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${boardTitle.replace(/\s+/g, "-").slice(0, 40) || "board"}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("JSON export downloaded");
  };

  const clearCanvas = () => {
    if (!boardId) return;
    if (!window.confirm("Clear all objects on this board? You can undo once.")) return;
    setBoard((b) => {
      const next = { objects: [] };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      setSelectedId(null);
      void persist(next);
      return next;
    });
    showToast("Canvas cleared");
  };

  const copyBoardLink = async () => {
    if (!boardId) return;
    const url = `${window.location.origin}/?board=${boardId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast("Shareable board link copied");
    } catch {
      showToast(url);
    }
  };

  const duplicateSelected = () => {
    if (!selectedId) {
      showToast("Select something first");
      return;
    }
    setBoard((b) => {
      const o = b.objects.find((x) => x.id === selectedId);
      if (!o) return b;
      const copy = { ...cloneItem(o), id: newId(), x: o.x + 20, y: o.y + 20 };
      const next = { objects: [...b.objects, copy] };
      setUndoStack((u) => [...u.slice(-49), snapshot(b)]);
      setRedoStack([]);
      void persist(next);
      return next;
    });
  };

  const sendInvite = async () => {
    if (!orgId || !inviteEmail) {
      showToast("Organization and email required");
      return;
    }
    setInviteLoading(true);
    try {
      const res = await fetch(`/api/orgs/${orgId}/invites`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: "member" }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(typeof data.error === "string" ? data.error : "Invite failed");
        return;
      }
      const savedEmail = inviteEmail;
      setInviteEmail("");
      setInviteModal({
        link: data.acceptUrl,
        email: savedEmail,
        message: data.message ?? "Share this link with your teammate:",
      });
    } catch (err) {
      showToast("Network error — please try again.");
    } finally {
      setInviteLoading(false);
    }
  };

  const tools: { id: Tool; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: "select", label: "Select", icon: <MousePointer2 className="h-4 w-4" />, hint: "V" },
    { id: "pencil", label: "Pencil", icon: <Pencil className="h-4 w-4" />, hint: "P" },
    { id: "highlighter", label: "Glow", icon: <Highlighter className="h-4 w-4" />, hint: "H" },
    { id: "text", label: "Text", icon: <Type className="h-4 w-4" />, hint: "T" },
    { id: "sticky", label: "Sticky", icon: <StickyNote className="h-4 w-4" />, hint: "⇧S" },
    { id: "rect", label: "Rectangle", icon: <Square className="h-4 w-4" />, hint: "R" },
    { id: "circle", label: "Ellipse", icon: <Circle className="h-4 w-4" />, hint: "C" },
    { id: "image", label: "Image", icon: <ImageIcon className="h-4 w-4" />, hint: "I" },
  ];

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-[var(--background)]">
        <div
          className="pointer-events-none absolute inset-0 opacity-45"
          style={{
            background:
              "radial-gradient(ellipse 70% 50% at 50% -15%, rgba(99,102,241,0.45), transparent), radial-gradient(ellipse 40% 35% at 95% 25%, rgba(34,211,238,0.12), transparent)",
          }}
        />
        <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-16">
          <div className="grid w-full max-w-5xl gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">Board</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Collaborative whiteboard, production-ready flows</h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[var(--muted)]">
                Realtime sync across browsers, organizations, invites, favorites, layers, and keyboard-first tools — packaged in a calm, modern interface.
              </p>
              <div className="mt-8 flex flex-wrap gap-3 text-sm text-[var(--muted)]">
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1">Live persistence</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1">SQLite + Prisma</span>
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1">Broadcast + polling</span>
              </div>
            </div>
            <Card className="border-white/10 bg-[var(--card)]/85 p-8 shadow-2xl shadow-black/50 backdrop-blur-md">
              <h2 className="text-lg font-semibold text-white">{isRegister ? "Create your workspace" : "Welcome back"}</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Use a real email if you plan to accept invites.</p>
              <div className="mt-6 space-y-3">
                <Input placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
                {isRegister && <Input placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />}
                <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isRegister ? "new-password" : "current-password"} />
                {authError && <p className="text-sm text-red-400">{authError}</p>}
                <Button variant="primary" className="w-full" type="button" onClick={() => void auth()}>
                  {isRegister ? "Create account" : "Sign in"}
                </Button>
                <button
                  type="button"
                  className="w-full text-center text-sm text-[var(--muted)] underline-offset-4 hover:text-white hover:underline"
                  onClick={() => {
                    setIsRegister((v) => !v);
                    setAuthError("");
                  }}
                >
                  {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
                </button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const sortedBoards = [...boards].sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const selected = board.objects.find((o) => o.id === selectedId) ?? null;

  // Deck Management Methods
  const selectSlide = (id: string) => {
    if (activePageIdRef.current === id) return;
    activePageIdRef.current = id;
    setActivePageId(id);
    const pIdx = deckPagesRef.current.findIndex(p => p.id === id);
    if (pIdx > -1) {
      setBoard({ objects: deckPagesRef.current[pIdx].objects });
      setUndoStack([]); // clear history for new slide
      setRedoStack([]);
    }
  };

  const addSlide = () => {
    const newIdStr = newId();
    deckPagesRef.current.push({ id: newIdStr, name: `Slide ${deckPagesRef.current.length + 1}`, objects: [] });
    setDeckPages([...deckPagesRef.current]);
    selectSlide(newIdStr);
    void persist({ objects: [] }); // Sync addition
  };

  const deleteSlide = (id: string) => {
    if (deckPagesRef.current.length <= 1) return;
    const filtered = deckPagesRef.current.filter(p => p.id !== id);
    deckPagesRef.current = filtered;
    setDeckPages(filtered);
    if (activePageIdRef.current === id) {
      selectSlide(filtered[0].id);
    } else {
      void persist({ objects: board.objects }); // Just sync the deletion
    }
  };

  const exportPDF = async () => {
    if (!canvasRef.current || deckPages.length === 0) return;
    setExportingPDF(true);
    
    // Create new PDF (A4 landscape)
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080] });
    
    const originalActive = activePageIdRef.current;
    
    try {
      // Loop through all slides
      for (let i = 0; i < deckPages.length; i++) {
        const slide = deckPages[i];
        
        // Force the canvas to render this slide's objects briefly
        setBoard({ objects: slide.objects });
        // Wait for React to render the DOM
        await new Promise(r => setTimeout(r, 300));
        
        const canvasElement = canvasRef.current;
        const htmlCanvas = await html2canvas(canvasElement, {
          backgroundColor: "#0f172a", // Match background surface perfectly
          scale: 1, // 1080p scale matching 1920x1080
          useCORS: true,
          logging: false
        });
        
        const imgData = htmlCanvas.toDataURL("image/webp", 0.95);
        if (i > 0) pdf.addPage([1920, 1080], "landscape");
        pdf.addImage(imgData, "WEBP", 0, 0, 1920, 1080);
      }
      
      pdf.save(`${boardTitle || "Presentation"}.pdf`);
    } catch (err) {
      console.error(err);
      setToast("Failed to generate PDF.");
      setTimeout(() => setToast(null), 3000);
    } finally {
      // Restore the user's active slide
      selectSlide(originalActive);
      setExportingPDF(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-5 py-3 text-sm shadow-xl">
          {toast}
        </div>
      )}
      <AiBotPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        boardId={boardId}
        onToast={(msg) => showToast(msg)}
      />

      {/* Hidden file input for image uploads */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file || !imagePlacementRef.current) return;
          const { x, y } = imagePlacementRef.current;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target?.result as string;
            const img = new window.Image();
            img.onload = () => {
              const MAX = 480;
              const ratio = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
              addItem({
                id: newId(),
                type: "image",
                x,
                y,
                w: Math.round(img.naturalWidth * ratio),
                h: Math.round(img.naturalHeight * ratio),
                color: "transparent",
                base64,
              });
              setTool("select");
            };
            img.src = base64;
          };
          reader.readAsDataURL(file);
          // Reset so the same file can be re-selected
          e.target.value = "";
        }}
      />

      {/* ── Invite Link Modal ── */}
      {inviteModal && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => setInviteModal(null)}
          onKeyDown={(e) => e.key === "Escape" && setInviteModal(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20">
                <UserPlus className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Invite Sent!</h3>
                <p className="text-xs text-[var(--muted)]">To: {inviteModal.email}</p>
              </div>
            </div>

            <p className="mb-3 text-sm text-[var(--muted)]">
              {inviteModal.message}
            </p>

            <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 mb-4">
              <span className="flex-1 truncate text-xs text-indigo-300 font-mono">{inviteModal.link}</span>
              <button
                type="button"
                className="shrink-0 rounded-lg bg-indigo-600 hover:bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteModal.link);
                  showToast("Invite link copied! ✅");
                }}
              >
                Copy
              </button>
            </div>


            <button
              type="button"
              className="w-full rounded-xl bg-[var(--surface-2)] hover:bg-white/10 py-2.5 text-sm font-medium text-[var(--muted)] transition-colors"
              onClick={() => setInviteModal(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {showHelp && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard shortcuts"
          onClick={() => setShowHelp(false)}
          onKeyDown={(e) => e.key === "Escape" && setShowHelp(false)}
        >
          <Card className="max-h-[85vh] w-full max-w-lg overflow-y-auto p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-lg font-semibold text-white">Shortcuts & collaboration</h2>
              <button type="button" className="text-sm text-[var(--muted)] hover:text-white" onClick={() => setShowHelp(false)}>
                Close
              </button>
            </div>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Undo keeps working while others edit: each remote update is added to your undo history so you can step back through teammate changes too.
            </p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">Ctrl+Z</kbd> /{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">⌘Z</kbd> Undo
              </li>
              <li>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">Ctrl+Shift+Z</kbd> Redo
              </li>
              <li>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">Ctrl+D</kbd> Duplicate selection
              </li>
              <li>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">V</kbd> Select ·{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">P</kbd> Pencil ·{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">H</kbd> Glow highlighter
              </li>
              <li>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">T</kbd> Text ·{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">Shift+S</kbd> Sticky ·{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">R</kbd> /{" "}
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">C</kbd> Shapes
              </li>
              <li>
                <kbd className="rounded border border-[var(--border)] bg-[var(--surface-2)] px-1.5 py-0.5">Shift+?</kbd> Toggle this panel
              </li>
            </ul>
          </Card>
        </div>
      )}
      <aside className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-xl">
        <div className="border-b border-[var(--border)] p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-indigo-300/90">Board</p>
              <p className="mt-0.5 truncate text-sm font-semibold">{user.name}</p>
              <p className="truncate text-xs text-[var(--muted)]">{user.email}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-9 w-9 shrink-0 rounded-xl p-0"
              type="button"
              title="Sign out"
              onClick={() => void fetch("/api/auth/logout", { method: "POST" }).then(() => setUser(null))}
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Organization</p>
            <div className="space-y-2">
              <select
                className="flex h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 text-sm outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
                value={orgId}
                onChange={(e) => setOrgId(e.target.value)}
              >
                <option value="">Select org…</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input className="flex-1" value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="New org name" />
                <Button type="button" variant="secondary" className="shrink-0 px-3" onClick={() => void createOrg()}>
                  New
                </Button>
              </div>
            </div>
          </section>

          <section>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Invite</p>
            <div className="flex gap-2">
              <Input 
                className="flex-1" 
                placeholder="teammate@email.com" 
                value={inviteEmail} 
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && void sendInvite()}
                disabled={inviteLoading}
              />
              <Button 
                type="button" 
                variant="secondary" 
                className="shrink-0 px-3" 
                title="Send invite" 
                onClick={() => void sendInvite()}
                disabled={inviteLoading || !inviteEmail.trim()}
              >
                {inviteLoading 
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white inline-block" />
                  : <UserPlus className="h-4 w-4" />
                }
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-[var(--muted)]">Invitees accept at <span className="text-indigo-300">/invite/:token</span> while signed in.</p>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Boards</p>
              <Button size="sm" variant="ghost" type="button" className="h-7 text-xs" onClick={() => void loadBoards()}>
                Refresh
              </Button>
            </div>
            <div className="space-y-1.5">
              {sortedBoards.length === 0 && <p className="text-sm text-[var(--muted)]">No boards yet — create one on the right.</p>}
              {sortedBoards.map((b) => (
                <div
                  key={b.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-xl border border-transparent transition-colors",
                    boardId === b.id ? "border-indigo-500/40 bg-indigo-500/10" : "hover:bg-[var(--surface-2)]",
                  )}
                >
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm"
                    onClick={() => void openBoard(b.id)}
                  >
                    <span className="truncate font-medium">{b.title}</span>
                  </button>
                  <button
                    type="button"
                    className="mr-1 rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--surface)] hover:text-amber-300"
                    aria-label="Favorite"
                    onClick={() => void toggleFavorite(b.id, !b.isFavorite)}
                  >
                    <Star className={cn("h-4 w-4", b.isFavorite && "fill-amber-400 text-amber-400")} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="border-t border-[var(--border)] p-4 space-y-2">
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200/90">
            <Wifi className="h-3.5 w-3.5 shrink-0" />
            <span>Realtime: tabs + poll (~650ms)</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{lastSyncText}</span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/50 px-4 py-3 backdrop-blur-md">
          <Input
            className="max-w-md border-transparent bg-transparent text-base font-semibold focus:border-indigo-500/30"
            value={boardTitle}
            onChange={(e) => setBoardTitle(e.target.value)}
            disabled={!boardId}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="ghost" size="sm" title="Shortcuts (?)" onClick={() => setShowHelp(true)}>
              <HelpCircle className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!boardId}
              title="BoardBot (AI notes)"
              onClick={() => setAiOpen(true)}
            >
              <Bot className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={!boardId} title="Templates" onClick={() => applyTemplate("brainstorm")}>
              <Sparkles className="h-4 w-4 sm:mr-1" />
              <span className="hidden sm:inline">Brainstorm</span>
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={!boardId} onClick={() => applyTemplate("retro")}>
              Retro
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={!boardId} onClick={() => applyTemplate("sprint")}>
              Sprint
            </Button>
            
            <div className="mx-1 h-5 w-px bg-white/20" />
            
            <Button type="button" variant="secondary" size="sm" disabled={!boardId || aiWorking} onClick={handleSemanticGrouping} title="Organize Chaos">
              <Wand2 className="h-4 w-4 sm:mr-1 text-purple-400" />
              <span className="hidden sm:inline">Clean Up</span>
            </Button>
            <Button type="button" variant={isVoiceActive ? "primary" : "secondary"} size="sm" disabled={!boardId} onClick={() => setIsVoiceActive(!isVoiceActive)} title="Voice Command">
              <Mic className={cn("h-4 w-4", isVoiceActive ? "text-white animate-pulse" : "text-sky-400")} />
            </Button>
            <Button type="button" variant={isAutoCollab ? "primary" : "secondary"} size="sm" disabled={!boardId} onClick={() => setIsAutoCollab(!isAutoCollab)} title="Auto Collab">
              <Users className={cn("h-4 w-4", isAutoCollab ? "text-white" : "text-amber-400")} />
            </Button>
            
            <div className="mx-1 h-5 w-px bg-white/20" />

            <Button type="button" variant="secondary" size="sm" disabled={!boardId} title="Copy link" onClick={() => void copyBoardLink()}>
              <Copy className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={!boardId} title="Export JSON" onClick={exportBoardJson}>
              <Download className="h-4 w-4" />
            </Button>
            <Button type="button" variant="destructive" size="sm" disabled={!boardId} title="Clear canvas" onClick={clearCanvas}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={!orgId} onClick={() => void createBoard()}>
              New board
            </Button>
            {boardId && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  const b = boards.find((x) => x.id === boardId);
                  void toggleFavorite(boardId, !b?.isFavorite);
                }}
              >
                <Star className={cn("h-4 w-4", boards.find((x) => x.id === boardId)?.isFavorite && "fill-amber-400 text-amber-400")} />
                Favorite
              </Button>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]/60 px-4 pl-56 py-2">
          {tools.map((t) => (
            <Button
              key={t.id}
              type="button"
              variant={tool === t.id ? "primary" : "secondary"}
              size="sm"
              className="rounded-xl"
              title={`${t.label} (${t.hint})`}
              onClick={() => setTool(t.id)}
            >
              {t.icon}
              <span className="hidden sm:inline">{t.label}</span>
            </Button>
          ))}
          <div className="mx-1 hidden h-6 w-px bg-[var(--border)] sm:block" />
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={cn("h-8 w-8 rounded-full border-2 transition-transform hover:scale-105", color === c ? "border-white ring-2 ring-indigo-400/60" : "border-transparent")}
              style={{ background: c }}
              onClick={() => setColor(c)}
            />
          ))}
          <div className="mx-1 hidden h-6 w-px bg-[var(--border)] md:block" />
          <Button type="button" variant="secondary" size="sm" disabled={undoStack.length === 0} onClick={undo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={redoStack.length === 0} onClick={redo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </Button>
          <div className="mx-1 hidden h-6 w-px bg-[var(--border)] md:block" />
          <Button type="button" variant="secondary" size="sm" disabled={!selectedId} onClick={bringForward} title="Bring forward">
            <Layers className="h-4 w-4 rotate-180" />
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!selectedId} onClick={sendBackward} title="Send backward">
            <Layers className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="sm" disabled={!selectedId} onClick={duplicateSelected} title="Duplicate (Ctrl+D)">
            <CopyPlus className="h-4 w-4" />
          </Button>
          {selected && selected.type === "sticky" && (
             <Button type="button" variant="primary" size="sm" disabled={aiWorking} className="ml-2 ring-2 ring-purple-400/50" onClick={handleMindmapExplosion}>
               <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Explode
             </Button>
          )}
          {selected && selected.type === "pencil" && (
             <Button type="button" variant="primary" size="sm" disabled={aiWorking} className="ml-2 ring-2 ring-sky-400/50" onClick={generateUI}>
               <Wand2 className="h-3.5 w-3.5 mr-1" /> Make UI
             </Button>
          )}
          {selected && (
            <span className="ml-2 hidden text-xs text-[var(--muted)] md:inline">
              use <kbd className="rounded bg-black/20 px-1 border border-white/10">Del</kbd> to delete
            </span>
          )}
        </div>

        <div className="relative flex-1 p-4">

          {!boardId ? (
            <Card className="flex h-full min-h-[420px] items-center justify-center border-dashed border-[var(--border)] bg-[var(--surface)]/40 p-8 text-center">
              <div>
                <p className="text-lg font-medium text-white">Choose or create a board</p>
                <p className="mt-2 max-w-md text-sm text-[var(--muted)]">Select a board from the sidebar, or create a new one. Your canvas syncs in realtime for demos across multiple browsers.</p>
              </div>
            </Card>
          ) : (
            <div className="flex gap-3 h-[calc(100vh-200px)] min-h-[480px]">
              {/* ───── Slide Navigator (bottom-left strip) ───── */}
              {boardId && (
                <div className="flex flex-col w-[158px] shrink-0 gap-2 rounded-2xl bg-[var(--surface-2)]/95 backdrop-blur border border-[var(--border)] shadow-2xl p-2.5 overflow-hidden">
                  <div className="flex justify-between items-center px-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)]">Slides</span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-lg hover:bg-white/10" onClick={addSlide} title="Add slide">
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Slide thumbnails */}
                  <div className="flex-1 overflow-y-auto space-y-2 pr-0.5">
                    {deckPages.map((p, i) => (
                      <div
                        key={p.id}
                        onClick={() => selectSlide(p.id)}
                        className={cn(
                          "w-full aspect-video rounded-lg border-2 cursor-pointer flex items-end p-1.5 transition-all duration-150 group relative overflow-hidden",
                          activePageId === p.id
                            ? "border-indigo-500 ring-2 ring-indigo-500/25 shadow-md"
                            : "border-transparent hover:border-white/20 opacity-70 hover:opacity-100"
                        )}
                        style={{ background: p.background || "#0f172a" }}
                      >
                        <span className="text-[9px] font-bold text-white bg-black/70 px-1 py-0.5 rounded backdrop-blur z-10">
                          {i + 1}
                        </span>
                        {deckPages.length > 1 && (
                          <button
                            type="button"
                            className="absolute top-0.5 right-0.5 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-red-600/90 hover:bg-red-500 transition-opacity z-10"
                            onClick={(e) => { e.stopPropagation(); deleteSlide(p.id); }}
                          >
                            <Trash2 className="h-2.5 w-2.5 text-white" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Slide Background Color Picker */}
                  <div className="border-t border-[var(--border)] pt-2 space-y-1.5">
                    <p className="text-[10px] uppercase font-semibold tracking-widest text-[var(--muted)] px-0.5">BG Color</p>
                    <div className="flex flex-wrap gap-1.5">
                      {["#0f172a","#1e293b","#ffffff","#fef9c3","#dcfce7","#dbeafe","#f3e8ff","#fee2e2"].map(bg => {
                        const activePage = deckPages.find(p => p.id === activePageId);
                        const isActive = (activePage?.background || "#0f172a") === bg;
                        return (
                          <button
                            key={bg}
                            type="button"
                            title={bg}
                            className={cn("h-6 w-6 rounded-md border-2 transition-transform hover:scale-110", isActive ? "border-indigo-400 ring-1 ring-indigo-400" : "border-white/10")}
                            style={{ background: bg }}
                            onClick={() => {
                              const updated = deckPagesRef.current.map(p =>
                                p.id === activePageId ? { ...p, background: bg } : p
                              );
                              deckPagesRef.current = updated;
                              setDeckPages([...updated]);
                              void persist({ objects: board.objects });
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Export button */}
                  <Button variant="primary" className="w-full text-[11px] font-semibold h-8 gap-1 bg-indigo-600 hover:bg-indigo-500 shrink-0" onClick={exportPDF} disabled={exportingPDF}>
                    <Download className="h-3 w-3" />
                    {exportingPDF ? "Working…" : "Export PDF"}
                  </Button>
                </div>
              )}

              {/* ───── Main Canvas ───── */}
              <div
                ref={canvasRef}
                onMouseDown={onCanvasDown}
                onMouseMove={onCanvasMove}
                onMouseUp={endDraw}
                onMouseLeave={endDraw}
                className={cn(
                  "canvas-grid relative flex-1 overflow-hidden rounded-2xl border border-[var(--border)] shadow-inner shadow-black/40 transition-colors duration-300",
                  tool === "select" ? "cursor-default" : "cursor-crosshair",
                )}
                style={{ background: deckPages.find(p => p.id === activePageId)?.background || undefined }}
              >
              {board.objects.map((o, i) => {
                const isSel = o.id === selectedId;
                return (
                  <div
                    key={`${o.id}-${i}`}
                    role="presentation"
                    className={cn(
                      "absolute select-none",
                      tool === "select" && "cursor-pointer",
                      isSel && "ring-2 ring-indigo-400 ring-offset-2 ring-offset-[var(--surface)]",
                    )}
                    style={{ left: o.x, top: o.y, zIndex: i + 1 }}
                    onMouseDown={(e) => onItemDown(e, o.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (tool === "select" && (o.type === "text" || o.type === "sticky")) setEditingId(o.id);
                    }}
                  >
                    {o.type === "image" && o.base64 && (
                      <img
                        src={o.base64}
                        alt="canvas-img"
                        draggable={false}
                        style={{ width: o.w || 240, height: o.h || 180, objectFit: "cover", borderRadius: 8, display: "block" }}
                      />
                    )}
                    {o.type === "text" && (
                      <div
                        contentEditable={editingId === o.id}
                        suppressContentEditableWarning
                        className={cn("min-w-[80px] rounded-md px-1 text-base outline-none", editingId === o.id && "ring-1 ring-indigo-400/60")}
                        style={{ color: o.color }}
                        onBlur={(e) => {
                          const text = e.currentTarget.textContent ?? "";
                          const next = {
                            objects: board.objects.map((x) => (x.id === o.id ? { ...x, text } : x)),
                          };
                          setBoard(next);
                          setEditingId(null);
                          void persist(next);
                        }}
                        onMouseDown={(e) => tool === "select" && e.stopPropagation()}
                      >
                        {o.text}
                      </div>
                    )}
                    {o.type === "sticky" && (
                      <div
                        contentEditable={editingId === o.id}
                        suppressContentEditableWarning
                        className={cn(
                          "rounded-xl p-3 text-sm leading-snug shadow-lg ring-1 ring-black/20 outline-none",
                          editingId === o.id && "ring-2 ring-indigo-400",
                        )}
                        style={{ width: o.w, height: o.h, background: o.color, color: "#1f2937" }}
                        onBlur={(e) => {
                          const text = e.currentTarget.textContent ?? "";
                          const next = {
                            objects: board.objects.map((x) => (x.id === o.id ? { ...x, text } : x)),
                          };
                          setBoard(next);
                          setEditingId(null);
                          void persist(next);
                        }}
                        onMouseDown={(e) => tool === "select" && e.stopPropagation()}
                      >
                        {o.text}
                      </div>
                    )}
                    {o.type === "rect" && (
                      <div
                        className="rounded-lg"
                        style={{
                          width: o.w,
                          height: o.h,
                          background: `${o.color}22`,
                          border: `2px solid ${o.color}`,
                          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                        }}
                      />
                    )}
                    {o.type === "circle" && (
                      <div
                        className="rounded-full"
                        style={{
                          width: o.w,
                          height: o.h,
                          background: `${o.color}22`,
                          border: `2px solid ${o.color}`,
                          boxShadow: "0 10px 30px rgba(0,0,0,0.18)",
                        }}
                      />
                    )}
                    {o.type === "html" && (
                      <div 
                        className={cn("rounded-xl shadow-2xl bg-white text-black overflow-hidden pointer-events-auto", isSel && "ring-4 ring-indigo-500")}
                        style={{ width: o.w, minHeight: o.h }}
                        dangerouslySetInnerHTML={{ __html: o.htmlContent || "" }}
                      />
                    )}
                    {o.type === "pencil" && (
                      <svg className="pointer-events-none overflow-visible" style={{ minWidth: 4, minHeight: 4, mixBlendMode: o.opacity != null && o.opacity < 1 ? "multiply" : undefined }}>
                        <polyline
                          fill="none"
                          stroke={o.color}
                          strokeWidth={o.strokeWidth ?? 2.5}
                          strokeOpacity={o.opacity ?? 1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={(o.points ?? []).map((p) => `${p.x - o.x},${p.y - o.y}`).join(" ")}
                        />
                      </svg>
                    )}
                  </div>
                );
              })}

              {draftStroke && draftStroke.points && draftStroke.points.length > 0 && (
                <svg
                  className="pointer-events-none absolute left-0 top-0 z-[200] h-full w-full overflow-visible"
                  style={{ mixBlendMode: draftStroke.opacity != null && draftStroke.opacity < 1 ? "multiply" : undefined }}
                >
                  <polyline
                    fill="none"
                    stroke={draftStroke.color}
                    strokeWidth={draftStroke.strokeWidth ?? 2.5}
                    strokeOpacity={draftStroke.opacity ?? 1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={draftStroke.points.map((p) => `${p.x},${p.y}`).join(" ")}
                  />
                </svg>
              )}

              {shapeDraft && (
                <div
                  key="shape-draft"
                  className="pointer-events-none absolute z-[190] border-2 border-dashed border-indigo-400/80 bg-indigo-400/10"
                  style={{
                    left: Math.min(shapeDraft.x0, shapeDraft.x1),
                    top: Math.min(shapeDraft.y0, shapeDraft.y1),
                    width: Math.abs(shapeDraft.x1 - shapeDraft.x0),
                    height: Math.abs(shapeDraft.y1 - shapeDraft.y0),
                    borderRadius: shapeDraft.kind === "circle" ? "9999px" : "12px",
                  }}
                />
              )}

              {Object.entries(cursors).map(([id, c]: any) => (
                <div
                  key={`cursor-${id}`}
                  className="pointer-events-none absolute z-[300] flex flex-col items-start transition-all duration-[200ms] ease-linear"
                  style={{ left: c.x, top: c.y }}
                >
                  <MousePointer2 className="h-5 w-5 fill-rose-500 text-white shadow-sm" />
                  <div className="mt-1 rounded-md bg-rose-500 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white shadow-xl ring-1 ring-white/20">
                    {c.name}
                  </div>
                </div>
              ))}
            </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
