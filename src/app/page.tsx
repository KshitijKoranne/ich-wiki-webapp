"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import wikiData from "@/lib/wiki-data.json";

/* ── Category palette ────────────────────────────────────────────── */
const CAT: Record<string, { bg: string; fg: string; accent: string }> = {
  Stability: { bg: "#0f1f0f", fg: "#5cb85c", accent: "#1a3a1a" },
  "Analytical Validation": { bg: "#0f0f1f", fg: "#5b7fcf", accent: "#1a1a3a" },
  Impurities: { bg: "#1f0f0f", fg: "#cf5b5b", accent: "#3a1a1a" },
  Biotechnology: { bg: "#0f1f1f", fg: "#5bcfcf", accent: "#1a3a3a" },
  Specifications: { bg: "#1f1f0f", fg: "#cfcf5b", accent: "#3a3a1a" },
  GMP: { bg: "#1f0f1f", fg: "#cf5bcf", accent: "#3a1a3a" },
  "Pharmaceutical Development": { bg: "#0f1a1f", fg: "#5ba8cf", accent: "#1a2a3a" },
  "Quality Risk Management": { bg: "#1f180f", fg: "#cf8f5b", accent: "#3a2a1a" },
  "Quality Systems": { bg: "#180f1f", fg: "#8f5bcf", accent: "#2a1a3a" },
};
const catOf = (c: string) => CAT[c] || { bg: "#111", fg: "#777", accent: "#222" };

/* ── Types ───────────────────────────────────────────────────────── */
type WikiItem = {
  id: string;
  title: string;
  guideline?: string;
  category: string;
  status?: string;
  version?: string;
  summary?: string;
  scope?: string;
  key_requirements?: string;
  definitions?: string;
  related?: string[];
  contradictions?: string;
  type: "guideline" | "concept" | "topic";
};

/* ── Markdown-lite ───────────────────────────────────────────────── */
function Md({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  const els: React.ReactNode[] = [];
  let tableRows: string[] = [];
  let listItems: { raw: string; text: string }[] = [];
  let key = 0;

  const flushTable = () => {
    if (tableRows.length < 2) return;
    const hdr = tableRows[0].split("|").filter(Boolean);
    const body = tableRows.slice(2);
    els.push(
      <div key={key++} style={{ overflowX: "auto", margin: "10px 0" }}>
        <table style={{ borderCollapse: "collapse", fontSize: 12, width: "100%" }}>
          <thead>
            <tr>{hdr.map((c, i) => <th key={i} style={{ background: "#0e0e0e", color: "#888", padding: "6px 10px", border: "1px solid #1a1a1a", textAlign: "left", fontWeight: 500 }}>{c.trim()}</th>)}</tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>{row.split("|").filter(Boolean).map((c, ci) => <td key={ci} style={{ padding: "5px 10px", border: "1px solid #141414", color: "#999" }}>{c.trim()}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
    tableRows = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    const isOl = /^\d+\./.test(listItems[0].raw);
    const Tag = isOl ? "ol" : "ul";
    els.push(<Tag key={key++} style={{ paddingLeft: 20, margin: "6px 0", fontSize: 12, color: "#bbb", lineHeight: 1.7 }}>{listItems.map((li, i) => <li key={i} style={{ margin: "3px 0" }}>{li.text}</li>)}</Tag>);
    listItems = [];
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("|") && t.endsWith("|")) { flushList(); tableRows.push(t); continue; }
    if (tableRows.length) flushTable();
    const lm = t.match(/^(\d+\.\s+|- |\* )(.+)/);
    if (lm) { listItems.push({ raw: t, text: lm[2] }); continue; }
    if (listItems.length) flushList();
    if (t.startsWith("### ")) { els.push(<h4 key={key++} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: "#ccc", margin: "14px 0 6px" }}>{t.slice(4)}</h4>); }
    else if (t.startsWith("## ")) { els.push(<h3 key={key++} style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, color: "#ddd", margin: "18px 0 8px" }}>{t.slice(3)}</h3>); }
    else if (t === "") continue;
    else {
      const html = t
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\[\[wiki\/(?:guidelines|concepts|topics)\/([^\]]+)\]\]/g, '<span style="color:#5b7fcf;text-decoration:underline;text-decoration-color:rgba(91,127,207,0.3)">$1</span>');
      els.push(<p key={key++} style={{ margin: "4px 0", fontSize: 12, color: "#bbb", lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: html }} />);
    }
  }
  flushTable();
  flushList();
  return <>{els}</>;
}

/* ── Knowledge Graph (Canvas) ────────────────────────────────────── */
function Graph({ items, edges, selectedId, onSelect }: {
  items: WikiItem[];
  edges: { source: string; target: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<any[]>([]);

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

    const catKeys = Object.keys(CAT);
    const nodes = items.map((item) => {
      const ci = catKeys.indexOf(item.category);
      const angle = ((ci < 0 ? 0 : ci) / catKeys.length) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      const radius = 90 + Math.random() * Math.min(w, h) * 0.25;
      return {
        ...item,
        x: w / 2 + Math.cos(angle) * radius + (Math.random() - 0.5) * 50,
        y: h / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 50,
        vx: 0, vy: 0,
      };
    });

    const nm: Record<string, any> = {};
    nodes.forEach(n => nm[n.id] = n);

    for (let iter = 0; iter < 250; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const f = 900 / (d * d);
          nodes[i].vx -= (dx / d) * f;
          nodes[i].vy -= (dy / d) * f;
          nodes[j].vx += (dx / d) * f;
          nodes[j].vy += (dy / d) * f;
        }
      }
      for (const e of edges) {
        const s = nm[e.source], t = nm[e.target];
        if (!s || !t) continue;
        const dx = t.x - s.x, dy = t.y - s.y;
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const f = (d - 70) * 0.004;
        s.vx += (dx / d) * f; s.vy += (dy / d) * f;
        t.vx -= (dx / d) * f; t.vy -= (dy / d) * f;
      }
      for (const n of nodes) {
        n.vx += (w / 2 - n.x) * 0.001;
        n.vy += (h / 2 - n.y) * 0.001;
        n.x += n.vx * 0.3; n.y += n.vy * 0.3;
        n.vx *= 0.88; n.vy *= 0.88;
        n.x = Math.max(40, Math.min(w - 40, n.x));
        n.y = Math.max(40, Math.min(h - 40, n.y));
      }
    }
    nodesRef.current = nodes;

    ctx.clearRect(0, 0, w, h);

    for (const e of edges) {
      const s = nm[e.source], t = nm[e.target];
      if (!s || !t) continue;
      const hi = selectedId && (e.source === selectedId || e.target === selectedId);
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y);
      ctx.strokeStyle = hi ? "rgba(180,180,255,0.35)" : "rgba(80,80,80,0.08)";
      ctx.lineWidth = hi ? 1.5 : 0.5;
      ctx.stroke();
    }

    for (const n of nodes) {
      const col = catOf(n.category);
      const sel = n.id === selectedId;
      const rel = selectedId && edges.some(e => (e.source === selectedId && e.target === n.id) || (e.target === selectedId && e.source === n.id));
      const r = n.type === "guideline" ? (sel ? 10 : 5) : (sel ? 8 : 3.5);

      ctx.beginPath(); ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = sel ? "#fff" : rel ? col.fg : col.accent;
      ctx.fill();
      if (sel) { ctx.strokeStyle = col.fg; ctx.lineWidth = 2; ctx.stroke(); }

      if (sel || n.type === "guideline") {
        ctx.font = `${sel ? "600" : "400"} ${sel ? 10 : 8}px "DM Mono", monospace`;
        ctx.fillStyle = sel ? "#fff" : rel ? col.fg : "rgba(160,160,160,0.5)";
        ctx.textAlign = "center";
        ctx.fillText(n.guideline || n.id, n.x, n.y - r - 4);
      }
    }
  }, [items, edges, selectedId]);

  const handleClick = (e: React.MouseEvent) => {
    const canvas = ref.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    for (const n of nodesRef.current) {
      if ((n.x - x) ** 2 + (n.y - y) ** 2 < 160) { onSelect(n.id); return; }
    }
  };

  return <canvas ref={ref} onClick={handleClick} style={{ width: "100%", height: "100%", display: "block", cursor: "crosshair" }} />;
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function Home() {
  const [view, setView] = useState<"graph" | "browse" | "detail" | "ask">("graph");
  const [selId, setSelId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);

  const data = wikiData as any;

  const allItems: WikiItem[] = useMemo(() => {
    const items: WikiItem[] = [];
    Object.values(data.guidelines as Record<string, any>).forEach((g: any) => items.push({ ...g, type: "guideline" }));
    Object.values(data.concepts as Record<string, any>).forEach((c: any) => items.push({ ...c, type: "concept" }));
    Object.values((data.topics || {}) as Record<string, any>).forEach((t: any) => items.push({ ...t, type: "topic" }));
    return items;
  }, [data]);

  const filtered = useMemo(() => {
    if (!search) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.id.toLowerCase().includes(q) ||
      (i.category || "").toLowerCase().includes(q) ||
      (i.summary || "").toLowerCase().includes(q)
    );
  }, [allItems, search]);

  const categories = useMemo(() => {
    const m: Record<string, WikiItem[]> = {};
    allItems.forEach(i => { const c = i.category || "Other"; (m[c] = m[c] || []).push(i); });
    return m;
  }, [allItems]);

  const selected = useMemo(() =>
    selId ? (data.guidelines[selId] || data.concepts[selId] || (data.topics || {})[selId] || null) : null
  , [selId, data]);

  const handleSelect = useCallback((id: string) => { setSelId(id); setView("detail"); }, []);

  const handleAsk = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setAnswer("");
    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      setAnswer(json.answer || json.error || "No response.");
    } catch (e: any) {
      setAnswer("Error: " + e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ fontFamily: "'DM Mono',monospace", background: "#060606", color: "#d0d0d0", minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Header ──────────────────────────────────────────────── */}
      <header style={{ padding: "14px 20px", borderBottom: "1px solid #111", display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 17, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>ICH Wiki</span>
          <span style={{ fontSize: 9, color: "#444" }}>
            {Object.keys(data.guidelines).length}g · {Object.keys(data.concepts).length}c · {Object.keys(data.topics || {}).length}t · {data.graph.edges.length} edges
          </span>
        </div>

        <nav style={{ display: "flex", gap: 3 }}>
          {(["graph", "browse", "ask"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "5px 13px", fontSize: 10, fontFamily: "inherit",
              background: view === v ? "#161616" : "transparent",
              color: view === v ? "#fff" : "#555",
              border: view === v ? "1px solid #222" : "1px solid transparent",
              borderRadius: 3, cursor: "pointer",
            }}>{v === "ask" ? "Ask AI" : v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </nav>

        <input
          type="text" placeholder="Search..." value={search}
          onChange={e => { setSearch(e.target.value); if (e.target.value) setView("browse"); }}
          style={{
            marginLeft: "auto", padding: "5px 11px", fontSize: 10, fontFamily: "inherit",
            background: "#0a0a0a", color: "#aaa", border: "1px solid #1a1a1a",
            borderRadius: 3, width: 180, outline: "none",
          }}
        />
      </header>

      {/* ── Content ─────────────────────────────────────────────── */}
      <main style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Graph */}
        {view === "graph" && (
          <div style={{ flex: 1, position: "relative" }}>
            <Graph items={allItems} edges={data.graph.edges} selectedId={selId} onSelect={handleSelect} />
            <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Object.entries(CAT).map(([cat, col]) => (
                <span key={cat} style={{ fontSize: 8, color: col.fg, background: "rgba(0,0,0,0.7)", padding: "2px 6px", borderRadius: 2, border: `1px solid ${col.accent}` }}>
                  <span style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: col.fg, marginRight: 3, verticalAlign: "middle" }} />{cat}
                </span>
              ))}
            </div>
            <div style={{ position: "absolute", top: 14, left: 14, fontSize: 9, color: "#333", background: "rgba(0,0,0,0.5)", padding: "3px 7px", borderRadius: 2 }}>Click any node to view</div>
          </div>
        )}

        {/* Browse */}
        {view === "browse" && (
          <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
            {search ? (
              <>
                <p style={{ fontSize: 10, color: "#444", marginBottom: 12 }}>{filtered.length} results for &ldquo;{search}&rdquo;</p>
                <div style={{ display: "grid", gap: 6 }}>
                  {filtered.map(item => {
                    const col = catOf(item.category);
                    return (
                      <button key={item.id} onClick={() => handleSelect(item.id)} style={{
                        padding: "10px 14px", background: "#0a0a0a", border: `1px solid #151515`,
                        borderLeft: `3px solid ${col.fg}`, borderRadius: 3, textAlign: "left",
                        cursor: "pointer", color: "#bbb", fontFamily: "inherit", fontSize: 11,
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#fff", fontWeight: 500 }}>{item.guideline || item.title}</span>
                          <span style={{ fontSize: 8, color: col.fg, background: col.bg, padding: "2px 6px", borderRadius: 2 }}>{item.category}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#666", marginTop: 3 }}>{item.title}</div>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              Object.entries(categories).map(([cat, items]) => {
                const col = catOf(cat);
                return (
                  <div key={cat} style={{ marginBottom: 24 }}>
                    <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 13, fontWeight: 600, color: col.fg, marginBottom: 8, borderBottom: `1px solid ${col.accent}`, paddingBottom: 5 }}>{cat}</h2>
                    <div style={{ display: "grid", gap: 4 }}>
                      {items.map(item => (
                        <button key={item.id} onClick={() => handleSelect(item.id)} style={{
                          padding: "7px 10px", background: "#080808", border: "1px solid #111",
                          borderLeft: `2px solid ${col.fg}`, borderRadius: 2, textAlign: "left",
                          cursor: "pointer", color: "#aaa", fontFamily: "inherit", fontSize: 10,
                          display: "flex", justifyContent: "space-between",
                        }}>
                          <span><span style={{ color: "#ddd", marginRight: 8 }}>{item.guideline || item.id}</span>{item.title}</span>
                          <span style={{ color: "#333", fontSize: 8 }}>{item.type}</span>
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
            <button onClick={() => setView("browse")} style={{
              fontSize: 9, color: "#444", background: "none", border: "none",
              cursor: "pointer", fontFamily: "inherit", marginBottom: 14, padding: 0,
            }}>&larr; Back</button>

            <div style={{ borderLeft: `3px solid ${catOf(selected.category).fg}`, paddingLeft: 14, marginBottom: 20 }}>
              <h1 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 3, lineHeight: 1.2 }}>{selected.guideline || selected.title}</h1>
              <p style={{ fontSize: 12, color: "#777", margin: 0 }}>{selected.title}</p>
              <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, background: catOf(selected.category).bg, color: catOf(selected.category).fg, border: `1px solid ${catOf(selected.category).accent}` }}>{selected.category}</span>
                {selected.status && <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, background: "#0a160a", color: "#4a4", border: "1px solid #1a2a1a" }}>{selected.status}</span>}
                {selected.version && <span style={{ fontSize: 8, padding: "2px 7px", borderRadius: 2, background: "#0e0e0e", color: "#555", border: "1px solid #1a1a1a" }}>{selected.version}</span>}
              </div>
            </div>

            {[
              { label: "Summary", content: selected.summary },
              { label: "Scope", content: selected.scope },
              { label: "Key Requirements", content: selected.key_requirements },
              { label: "Definitions", content: selected.definitions },
            ].filter(s => s.content).map(s => (
              <section key={s.label} style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>{s.label}</h3>
                <Md text={s.content!} />
              </section>
            ))}

            {selected.contradictions && (
              <section style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 5 }}>Notes & Open Questions</h3>
                <div style={{ background: "#0e0a04", padding: "10px 14px", borderRadius: 3, border: "1px solid #1e1808" }}>
                  <Md text={selected.contradictions} />
                </div>
              </section>
            )}

            {selected.related?.length > 0 && (
              <section style={{ marginBottom: 18 }}>
                <h3 style={{ fontSize: 10, color: "#444", textTransform: "uppercase", letterSpacing: 1, marginBottom: 7 }}>Related</h3>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {selected.related.map((rel: string) => {
                    const ri = data.guidelines[rel] || data.concepts[rel] || (data.topics || {})[rel];
                    const col = ri ? catOf(ri.category) : catOf("Other");
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
            <h2 style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 6 }}>Ask the ICH Wiki</h2>
            <p style={{ fontSize: 10, color: "#444", marginBottom: 14 }}>AI answers from 28 ICH Q-series guidelines + Q&amp;A documents.</p>

            <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
              <input
                type="text" value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAsk()}
                placeholder="e.g. What are the accelerated stability conditions?"
                style={{
                  flex: 1, padding: "9px 12px", fontSize: 11, fontFamily: "inherit",
                  background: "#0a0a0a", color: "#ccc", border: "1px solid #1a1a1a",
                  borderRadius: 3, outline: "none",
                }}
              />
              <button onClick={handleAsk} disabled={loading} style={{
                padding: "9px 18px", fontSize: 10, fontFamily: "inherit", fontWeight: 500,
                background: loading ? "#0a0a0a" : "#0f1f0f",
                color: loading ? "#444" : "#5cb85c",
                border: `1px solid ${loading ? "#151515" : "#1a3a1a"}`,
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
                  fontSize: 8, padding: "3px 7px", background: "#080808",
                  color: "#555", border: "1px solid #141414", borderRadius: 2,
                  cursor: "pointer", fontFamily: "inherit",
                }}>{q}</button>
              ))}
            </div>

            {answer && (
              <div style={{
                background: "#080808", border: "1px solid #141414",
                borderRadius: 4, padding: "16px 18px", fontSize: 12,
                color: "#ccc", lineHeight: 1.7, whiteSpace: "pre-wrap",
              }}>{answer}</div>
            )}
          </div>
        )}
      </main>

      {/* ── Footer ──────────────────────────────────────────────── */}
      <footer style={{ padding: "8px 20px", borderTop: "1px solid #0e0e0e", fontSize: 8, color: "#2a2a2a", textAlign: "center" }}>
        ICH LLM Wiki — Built with Karpathy&apos;s LLM Wiki pattern · KJR Labs
      </footer>

      <style>{`
        * { box-sizing: border-box; margin: 0; }
        input:focus { border-color: #2a2a2a !important; }
        button:hover { opacity: 0.88; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: #060606; }
        ::-webkit-scrollbar-thumb { background: #1a1a1a; border-radius: 3px; }
      `}</style>
    </div>
  );
}
