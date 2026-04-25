"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import wikiData from "@/lib/wiki-data.json";

/* ── Theme ───────────────────────────────────────────────────────── */
type Theme = "light" | "dark";

const T = {
  light: {
    bg: "#fafaf8", bg2: "#f0f0ec", bg3: "#e8e8e4", fg: "#1a1a1a", fg2: "#555",
    fg3: "#888", border: "#ddd", border2: "#ccc", accent: "#2a6", card: "#fff",
    hover: "#f5f5f0", shadow: "0 1px 3px rgba(0,0,0,0.06)",
    canvasBg: "#f5f5f0", edgeColor: "rgba(0,0,0,0.04)", edgeHi: "rgba(40,100,60,0.3)",
    nodeLabel: "rgba(60,60,60,0.5)", noteBg: "#fffcf0", noteBorder: "#e8e0c0",
    noteFg: "#8a7030", tableBg: "#f8f8f5", tableHeader: "#f0f0ec", tableBorder: "#e0e0dc",
  },
  dark: {
    bg: "#060606", bg2: "#0a0a0a", bg3: "#111", fg: "#d0d0d0", fg2: "#888",
    fg3: "#444", border: "#1a1a1a", border2: "#222", accent: "#5cb85c", card: "#0a0a0a",
    hover: "#111", shadow: "none",
    canvasBg: "#060606", edgeColor: "rgba(80,80,80,0.08)", edgeHi: "rgba(180,180,255,0.35)",
    nodeLabel: "rgba(160,160,160,0.5)", noteBg: "#0e0a04", noteBorder: "#1e1808",
    noteFg: "#cf8f5b", tableBg: "#0a0a0a", tableHeader: "#0e0e0e", tableBorder: "#141414",
  },
};

const CAT_BASE: Record<string, { h: number; s: number }> = {
  Stability: { h: 120, s: 45 },
  "Analytical Validation": { h: 220, s: 45 },
  Impurities: { h: 0, s: 45 },
  Biotechnology: { h: 180, s: 45 },
  Specifications: { h: 55, s: 45 },
  GMP: { h: 290, s: 45 },
  "Pharmaceutical Development": { h: 200, s: 45 },
  "Quality Risk Management": { h: 30, s: 50 },
  "Quality Systems": { h: 270, s: 45 },
};

function catColors(cat: string, theme: Theme) {
  const base = CAT_BASE[cat] || { h: 0, s: 0 };
  if (theme === "dark") {
    return {
      bg: `hsl(${base.h}, ${base.s}%, 8%)`,
      fg: `hsl(${base.h}, ${base.s}%, 65%)`,
      accent: `hsl(${base.h}, ${base.s}%, 15%)`,
    };
  }
  return {
    bg: `hsl(${base.h}, ${base.s}%, 95%)`,
    fg: `hsl(${base.h}, ${base.s + 10}%, 35%)`,
    accent: `hsl(${base.h}, ${base.s}%, 85%)`,
  };
}

/* ── Types ───────────────────────────────────────────────────────── */
type WikiItem = {
  id: string; title: string; guideline?: string; category: string;
  status?: string; version?: string; summary?: string; scope?: string;
  key_requirements?: string; definitions?: string; related?: string[];
  contradictions?: string; type: "guideline" | "concept" | "topic";
};

/* ── Markdown-lite ───────────────────────────────────────────────── */
function Md({ text, theme }: { text: string; theme: Theme }) {
  if (!text) return null;
  const t = T[theme];
  const lines = text.split("\n");
  const els: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let listItems: { raw: string; text: string }[] = [];
  let k = 0;

  const flushTable = () => {
    if (tableRows.length < 2) { tableRows = []; return; }
    const hdr = tableRows[0].split("|").filter(Boolean);
    const body = tableRows.slice(2);
    els.push(
      <div key={k++} style={{ overflowX: "auto", margin: "10px 0" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead><tr>{hdr.map((c, i) => <th key={i} style={{ background: t.tableHeader, color: t.fg2, padding: "6px 10px", border: `1px solid ${t.tableBorder}`, textAlign: "left", fontWeight: 500 }}>{c.trim()}</th>)}</tr></thead>
          <tbody>{body.map((row, ri) => <tr key={ri}>{row.split("|").filter(Boolean).map((c, ci) => <td key={ci} style={{ padding: "5px 10px", border: `1px solid ${t.tableBorder}`, color: t.fg2 }}>{c.trim()}</td>)}</tr>)}</tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    const isOl = /^\d+\./.test(listItems[0].raw);
    const Tag = isOl ? "ol" : "ul";
    els.push(<Tag key={k++} style={{ paddingLeft: 20, margin: "6px 0", fontSize: 12, color: t.fg, lineHeight: 1.7 }}>{listItems.map((li, i) => <li key={i} style={{ margin: "3px 0" }}>{li.text}</li>)}</Tag>);
    listItems = [];
  };

  for (const line of lines) {
    const tr = line.trim();
    if (tr.startsWith("|") && tr.endsWith("|")) { flushList(); tableRows.push(tr); continue; }
    if (tableRows.length) flushTable();
    const lm = tr.match(/^(\d+\.\s+|- |\* )(.+)/);
    if (lm) { listItems.push({ raw: tr, text: lm[2] }); continue; }
    if (listItems.length) flushList();
    if (tr.startsWith("### ")) els.push(<h4 key={k++} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: t.fg, margin: "14px 0 6px" }}>{tr.slice(4)}</h4>);
    else if (tr.startsWith("## ")) els.push(<h3 key={k++} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: t.fg, margin: "18px 0 8px" }}>{tr.slice(3)}</h3>);
    else if (tr === "") continue;
    else {
      const html = tr
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[\[wiki\/(?:guidelines|concepts|topics)\/([^\]]+)\]\]/g, `<span style="color:${theme === "dark" ? "#5b7fcf" : "#2a5aaa"};text-decoration:underline;text-decoration-color:rgba(91,127,207,0.3)">$1</span>`);
      els.push(<p key={k++} style={{ margin: "4px 0", fontSize: 12, color: t.fg, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: html }} />);
    }
  }
  flushTable(); flushList();
  return <>{els}</>;
}

/* ── Knowledge Graph ─────────────────────────────────────────────── */
function Graph({ items, edges, selectedId, onSelect, theme }: {
  items: WikiItem[]; edges: { source: string; target: string }[];
  selectedId: string | null; onSelect: (id: string) => void; theme: Theme;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<any[]>([]);
  const t = T[theme];

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width, h = rect.height;

    const catKeys = Object.keys(CAT_BASE);
    const nodes = items.map((item) => {
      const ci = catKeys.indexOf(item.category);
      const angle = ((ci < 0 ? 0 : ci) / catKeys.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const radius = 90 + Math.random() * Math.min(w, h) * 0.25;
      return { ...item, x: w / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50, y: h / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50, vx: 0, vy: 0 };
    });

    const nm: Record<string, any> = {};
    nodes.forEach(n => nm[n.id] = n);

    for (let iter = 0; iter < 250; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = 900 / (d * d);
          nodes[i].vx -= (dx / d) * f; nodes[i].vy -= (dy / d) * f;
          nodes[j].vx += (dx / d) * f; nodes[j].vy += (dy / d) * f;
        }
      }
      for (const e of edges) {
        const s = nm[e.source], tr = nm[e.target];
        if (!s || !tr) continue;
        const dx = tr.x - s.x, dy = tr.y - s.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - 70) * 0.004;
        s.vx += (dx / d) * f; s.vy += (dy / d) * f;
        tr.vx -= (dx / d) * f; tr.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        n.vx += (w / 2 - n.x) * 0.001; n.vy += (h / 2 - n.y) * 0.001;
        n.x += n.vx * 0.3; n.y += n.vy * 0.3;
        n.vx *= 0.88; n.vy *= 0.88;
        n.x = Math.max(40, Math.min(w - 40, n.x));
        n.y = Math.max(40, Math.min(h - 40, n.y));
      }
    }
    nodesRef.current = nodes;
    ctx.clearRect(0, 0, w, h);

    for (const e of edges) {
      const s = nm[e.source], tr = nm[e.target];
      if (!s || !tr) continue;
      const hi = selectedId && (e.source === selectedId || e.target === selectedId);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tr.x, tr.y);
      ctx.strokeStyle = hi ? t.edgeHi : t.edgeColor;
      ctx.lineWidth = hi ? 1.5 : 0.5; ctx.stroke();
    }

    for (const n of nodes) {
      const col = catColors(n.category, theme);
      const sel = n.id === selectedId;
      const rel = selectedId && edges.some(e => (e.source === selectedId && e.target === n.id) || (e.target === selectedId && e.source === n.id));
      const r = n.type === "guideline" ? (sel ? 10 : 5) : (sel ? 8 : 3.5);
      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = sel ? (theme === "dark" ? "#fff" : "#1a1a1a") : rel ? col.fg : col.accent;
      ctx.fill();
      if (sel) { ctx.strokeStyle = col.fg; ctx.lineWidth = 2; ctx.stroke(); }
      if (sel || n.type === "guideline") {
        ctx.font = `${sel ? "600" : "400"} ${sel ? 10 : 8}px "DM Mono", monospace`;
        ctx.fillStyle = sel ? (theme === "dark" ? "#fff" : "#000") : rel ? col.fg : t.nodeLabel;
        ctx.textAlign = "center";
        ctx.fillText(n.guideline || n.id, n.x, n.y - r - 4);
      }
    }
  }, [items, edges, selectedId, theme]);

  const handleClick = (e: React.MouseEvent) => {
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      if ((n.x - x) ** 2 + (n.y - y) ** 2 < 160) { onSelect(n.id); return; }
    }
  };

  return <canvas ref={ref} onClick={handleClick} style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair", background: t.canvasBg }} />;
}

/* ── Main ─────────────────────────────────────────────────────────── */
export default function Home() {
  const [view, setView] = useState<"graph" | "browse" | "detail" | "ask">("graph");
  const [selId, setSelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  const t = T[theme];
  const data = wikiData as any;

  const allItems: WikiItem[] = useMemo(() => {
    const items: WikiItem[] = [];
    Object.values(data.guidelines as Record<string, any>).forEach((g: any) => items.push({ ...g, type: "guideline" }));
    Object.values(data.concepts as Record<string, any>).forEach((c: any) => items.push({ ...c, type: "concept" }));
    Object.values((data.topics || {}) as Record<string, any>).forEach((tt: any) => items.push({ ...tt, type: "topic" }));
    return items;
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(i => i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || (i.category || "").toLowerCase().includes(q) || (i.summary || "").toLowerCase().includes(q));
  }, [allItems, search]);

  const categories = useMemo(() => {
    const m: Record<string, WikiItem[]> = {};
    allItems.forEach(i => { const c = i.category || "Other"; (m[c] = m[c] || []).push(i); });
    return m;
  }, [allItems]);

  const selected = useMemo(() => selId ? (data.guidelines[selId] || data.concepts[selId] || (data.topics || {})[selId] || null) : null, [selId, data]);
  const handleSelect = useCallback((id: string) => { setSelId(id); setView("detail"); }, []);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true); setAnswer("");
    try {
      const res = await fetch("/api/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) });
      const json = await res.json();
      setAnswer(json.answer || json.error || "No response.");
    } catch (e: any) { setAnswer("Error: " + e.message); }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "'DM Mono',monospace", background: t.bg, color: t.fg, minHeight: "100vh", display: "flex", flexDirection: "column", transition: "background 0.2s, color 0.2s" }}>

      {/* Header */}
      <header style={{ padding: "12px 20px", borderBottom: `1px solid ${t.border}`, display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", background: t.card }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, fontWeight: 700, color: t.fg, letterSpacing: -0.5 }}>ICH Wiki</span>
          <span style={{ fontSize: 9, color: t.fg3 }}>
            {Object.keys(data.guidelines).length}g · {Object.keys(data.concepts).length}c · {Object.keys(data.topics || {}).length}t
          </span>
        </div>

        <nav style={{ display: "flex", gap: 3 }}>
          {(["graph", "browse", "ask"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "5px 13px", fontSize: 10, fontFamily: "inherit",
              background: view === v ? t.bg3 : "transparent",
              color: view === v ? t.fg : t.fg3,
              border: view === v ? `1px solid ${t.border2}` : "1px solid transparent",
              borderRadius: 3, cursor: "pointer",
            }}>{v === "ask" ? "Ask AI" : v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </nav>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="text" placeholder="Search..." value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setView("browse"); }}
            style={{ padding: "5px 11px", fontSize: 10, fontFamily: "inherit", background: t.bg2, color: t.fg, border: `1px solid ${t.border}`, borderRadius: 3, width: 160, outline: "none" }}
          />
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{
            padding: "4px 10px", fontSize: 9, fontFamily: "inherit",
            background: t.bg2, color: t.fg2, border: `1px solid ${t.border}`,
            borderRadius: 3, cursor: "pointer",
          }}>{theme === "dark" ? "Light" : "Dark"}</button>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Graph */}
        {view === "graph" && (
          <div style={{ flex: 1, position: "relative" }}>
            <Graph items={allItems} edges={data.graph.edges} selectedId={selId} onSelect={handleSelect} theme={theme} />
            <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", flexWrap: "wrap", gap: 5 }}>
              {Object.keys(CAT_BASE).map(cat => {
                const col = catColors(cat, theme);
                return (
                  <span key={cat} style={{ fontSize: 8, color: col.fg, background: theme === "dark" ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.85)", padding: "2px 6px", borderRadius: 2, border: `1px solid ${col.accent}` }}>
                    <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: col.fg, marginRight: 3, verticalAlign: "middle" }} />{cat}
                  </span>
                );
              })}
            </div>
            <div style={{ position: "absolute", top: 14, left: 14, fontSize: 9, color: t.fg3, background: theme === "dark" ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.8)", padding: "3px 7px", borderRadius: 2 }}>Click any node to view</div>
          </div>
        )}

        {/* Browse */}
        {view === "browse" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
            {search ? (
              <>
                <p style={{ fontSize: 10, color: t.fg3, marginBottom: 12 }}>{filtered.length} results for &ldquo;{search}&rdquo;</p>
                <div style={{ display: "grid", gap: 6 }}>
                  {filtered.map(item => {
                    const col = catColors(item.category, theme);
                    return (
                      <button key={item.id} onClick={() => handleSelect(item.id)} style={{
                        padding: "10px 14px", background: t.card, border: `1px solid ${t.border}`,
                        borderLeft: `3px solid ${col.fg}`, borderRadius: 3, textAlign: "left",
                        cursor: "pointer", color: t.fg, fontFamily: "inherit", fontSize: 11,
                        boxShadow: t.shadow,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ fontWeight: 500 }}>{item.guideline || item.title}</span>
                          <span style={{ fontSize: 8, color: col.fg, background: col.bg, padding: "2px 6px", borderRadius: 2 }}>{item.category}</span>
                        </div>
                        <div style={{ fontSize: 10, color: t.fg2, marginTop: 3 }}>{item.title}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              Object.entries(categories).map(([cat, items]) => {
                const col = catColors(cat, theme);
                return (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: col.fg, marginBottom: 8, borderBottom: `1px solid ${col.accent}`, paddingBottom: 5 }}>{cat}</h2>
                    <div style={{ display: "grid", gap: 4 }}>
                      {items.map(item => (
                        <button key={item.id} onClick={() => handleSelect(item.id)} style={{
                          padding: "7px 10px", background: t.card, border: `1px solid ${t.border}`,
                          borderLeft: `2px solid ${col.fg}`, borderRadius: 2, textAlign: "left",
                          cursor: "pointer", color: t.fg, fontFamily: "inherit", fontSize: 10,
                          display: "flex", justifyContent: "space-between", boxShadow: t.shadow,
                        }}>
                          <span><span style={{ fontWeight: 500, marginRight: 8 }}>{item.guideline || item.id}</span>{item.title}</span>
                          <span style={{ color: t.fg3, fontSize: 8 }}>{item.type}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Detail */}
        {view === "detail" && selected && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, maxWidth: 880 }}>
            <button onClick={() => setView("browse")} style={{ fontSize: 9, color: t.fg3, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", marginBottom: 14, padding: 0 }}>&larr; Back</button>

            <div style={{ borderLeft: `3px solid ${catColors(selected.category, theme).fg}`, paddingLeft: 14, marginBottom: 20 }}>
              <h1 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 20, fontWeight: 700, color: t.fg, marginBottom: 3, lineHeight: 1.2 }}>{selected.guideline || selected.title}</h1>
              <p style={{ fontSize: 12, color: t.fg2, margin: 0 }}>{selected.title}</p>
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                {(() => { const col = catColors(selected.category, theme); return <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, background: col.bg, color: col.fg, border: `1px solid ${col.accent}` }}>{selected.category}</span>; })()}
                {selected.status && <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, background: theme === "dark" ? "#0a160a" : "#e8f5e8", color: theme === "dark" ? "#4a4" : "#2a6a2a", border: `1px solid ${theme === "dark" ? "#1a2a1a" : "#c0e0c0"}` }}>{selected.status}</span>}
                {selected.version && <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, background: t.bg2, color: t.fg3, border: `1px solid ${t.border}` }}>{selected.version}</span>}
              </div>
            </div>

            {[
              { label: "Summary", content: selected.summary },
              { label: "Scope", content: selected.scope },
              { label: "Key Requirements", content: selected.key_requirements },
              { label: "Definitions", content: selected.definitions },
            ].filter(s => s.content).map(s => (
              <section key={s.label} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 10, color: t.fg3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{s.label}</h3>
                <Md text={s.content!} theme={theme} />
              </section>
            ))}

            {selected.contradictions && (
              <section style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 10, color: t.fg3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Notes & Open Questions</h3>
                <div style={{ background: t.noteBg, padding: "10px 14px", borderRadius: 3, border: `1px solid ${t.noteBorder}` }}>
                  <Md text={selected.contradictions} theme={theme} />
                </div>
              </section>
            )}

            {selected.related?.length > 0 && (
              <section style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 10, color: t.fg3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Related</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {selected.related.map((rel: string) => {
                    const ri = data.guidelines[rel] || data.concepts[rel] || (data.topics || {})[rel];
                    const col = ri ? catColors(ri.category, theme) : catColors("Other", theme);
                    return (
                      <button key={rel} onClick={() => setSelId(rel)} style={{
                        fontSize: 9, padding: "3px 9px", background: col.bg,
                        color: col.fg, border: `1px solid ${col.accent}`,
                        borderRadius: 2, cursor: "pointer", fontFamily: "inherit",
                      }}>{rel}</button>
                    );
                  })}
                </div>
              </section>
            )}
          </div>
        )}

        {/* Ask AI */}
        {view === "ask" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20, maxWidth: 780 }}>
            <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: t.fg, marginBottom: 6 }}>Ask the ICH Wiki</h2>
            <p style={{ fontSize: 10, color: t.fg3, marginBottom: 14 }}>AI answers from 28 ICH Q-series guidelines + Q&amp;A documents.</p>

            <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
              <input
                type="text" value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAsk()}
                placeholder="e.g. What are the accelerated stability conditions?"
                style={{ flex: 1, padding: "9px 12px", fontSize: 11, fontFamily: "inherit", background: t.bg2, color: t.fg, border: `1px solid ${t.border}`, borderRadius: 3, outline: "none" }}
              />
              <button onClick={handleAsk} disabled={loading} style={{
                padding: "9px 18px", fontSize: 10, fontFamily: "inherit", fontWeight: 500,
                background: loading ? t.bg2 : (theme === "dark" ? "#0f1f0f" : "#e8f5e8"),
                color: loading ? t.fg3 : (theme === "dark" ? "#5cb85c" : "#2a6a2a"),
                border: `1px solid ${loading ? t.border : (theme === "dark" ? "#1a3a1a" : "#c0e0c0")}`,
                borderRadius: 3, cursor: loading ? "wait" : "pointer",
              }}>{loading ? "..." : "Ask"}</button>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 18 }}>
              {[
                "What are the accelerated stability conditions per Q1A?",
                "What is significant change for a drug product?",
                "What training requirements exist per Q7?",
                "What are Class 1 elemental impurities?",
                "What are the three objectives of Q10 PQS?",
              ].map(q => (
                <button key={q} onClick={() => setQuery(q)} style={{
                  fontSize: 8, padding: "3px 7px", background: t.bg2,
                  color: t.fg3, border: `1px solid ${t.border}`, borderRadius: 2,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{q}</button>
              ))}
            </div>

            {answer && (
              <div style={{
                background: t.card, border: `1px solid ${t.border}`,
                borderRadius: 4, padding: "16px 18px", fontSize: 12,
                color: t.fg, lineHeight: 1.7, whiteSpace: "pre-wrap",
                boxShadow: t.shadow,
              }}>{answer}</div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer style={{ padding: "8px 20px", borderTop: `1px solid ${t.border}`, fontSize: 8, color: t.fg3, textAlign: "center", background: t.card }}>
        ICH LLM Wiki — Built with Karpathy&apos;s LLM Wiki pattern · KJR Labs
      </footer>

      <style>{`
        * { box-sizing: border-box; margin: 0; }
        input:focus { border-color: ${t.border2} !important; }
        button:hover { opacity: 0.88; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: ${t.bg}; }
        ::-webkit-scrollbar-thumb { background: ${t.border}; border-radius: 3px; }
      `}</style>
    </div>
  );
}
