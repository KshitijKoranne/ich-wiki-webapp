"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ── Types ───────────────────────────────────────────────────────── */
type Message = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[] };

const LOADING_PHRASES = [
  "Reviewing ICH guidelines",
  "Cross-referencing Q-series",
  "Analyzing regulatory requirements",
  "Checking GMP references",
  "Consulting quality standards",
  "Evaluating compliance criteria",
  "Reviewing stability protocols",
  "Parsing validation requirements",
  "Referencing impurity thresholds",
  "Checking pharmacopoeial texts",
];

/* ── Main ─────────────────────────────────────────────────────────── */
export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPhrase, setLoadingPhrase] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const phraseInterval = useRef<any>(null);

  const activeChat = chats.find(c => c.id === activeId) || null;

  // Detect desktop
  useEffect(() => {
    if (window.innerWidth > 768) setSidebarOpen(true);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  // Rotate loading phrases
  useEffect(() => {
    if (loading) {
      setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
      phraseInterval.current = setInterval(() => {
        setLoadingPhrase(LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]);
      }, 2200);
    } else {
      if (phraseInterval.current) clearInterval(phraseInterval.current);
    }
    return () => { if (phraseInterval.current) clearInterval(phraseInterval.current); };
  }, [loading]);

  const newChat = useCallback(() => {
    const id = Date.now().toString();
    setChats(prev => [{ id, title: "New chat", messages: [] }, ...prev]);
    setActiveId(id);
    setInput("");
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  }, [activeId]);

  const selectChat = useCallback((id: string) => {
    setActiveId(id);
    if (window.innerWidth <= 768) setSidebarOpen(false);
  }, []);

  const send = async () => {
    if (!input.trim() || loading) return;

    let chatId = activeId;

    if (!chatId) {
      const id = Date.now().toString();
      setChats(prev => [{ id, title: "New chat", messages: [] }, ...prev]);
      chatId = id;
      setActiveId(id);
    }

    const userMsg: Message = { role: "user", content: input.trim() };
    const currentInput = input.trim();
    setInput("");

    // Reset textarea height
    if (inputRef.current) inputRef.current.style.height = "auto";

    setChats(prev => prev.map(c => {
      if (c.id !== chatId) return c;
      const updated = { ...c, messages: [...c.messages, userMsg] };
      if (c.messages.length === 0) {
        updated.title = currentInput.slice(0, 40) + (currentInput.length > 40 ? "..." : "");
      }
      return updated;
    }));

    setLoading(true);

    try {
      const res = await fetch("/api/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: currentInput }),
      });
      const json = await res.json();
      const reply = json.answer || json.error || "No response.";

      setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        return { ...c, messages: [...c.messages, { role: "assistant", content: reply }] };
      }));
    } catch (e: any) {
      setChats(prev => prev.map(c => {
        if (c.id !== chatId) return c;
        return { ...c, messages: [...c.messages, { role: "assistant", content: "Connection error. Please try again." }] };
      }));
    }

    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  };

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: "#f9f9f7", color: "#1a1a1a", height: "100dvh", display: "flex", overflow: "hidden", position: "relative" }}>

      {/* ── Mobile overlay ────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="sidebar-overlay"
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div style={{ padding: "14px 12px 8px" }}>
          <button onClick={newChat} style={{
            width: "100%", padding: "10px 14px", fontSize: 13, fontWeight: 500,
            fontFamily: "inherit", background: "#fff", color: "#1a1a1a",
            border: "1px solid #d0d0ca", borderRadius: 8, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            New chat
          </button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
          {chats.map(chat => (
            <div key={chat.id} style={{ display: "flex", alignItems: "center", gap: 2, marginBottom: 2 }}>
              <button
                onClick={() => selectChat(chat.id)}
                style={{
                  flex: 1, padding: "9px 12px", fontSize: 12,
                  fontFamily: "inherit", textAlign: "left",
                  background: chat.id === activeId ? "#ddddd5" : "transparent",
                  color: chat.id === activeId ? "#1a1a1a" : "#555",
                  border: "none", borderRadius: 6, cursor: "pointer",
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}
              >{chat.title}</button>
              <button onClick={() => deleteChat(chat.id)} style={{
                padding: "4px 6px", fontSize: 12, background: "none",
                border: "none", color: "#bbb", cursor: "pointer",
                borderRadius: 4, flexShrink: 0,
              }}>&times;</button>
            </div>
          ))}
        </div>

        <div style={{ padding: "10px 14px", borderTop: "1px solid #ddd", fontSize: 9, color: "#999" }}>
          Powered by ICH Q-Series Knowledge Base
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          padding: "10px 16px", borderBottom: "1px solid #eee",
          display: "flex", alignItems: "center", gap: 10,
          background: "#fff", flexShrink: 0,
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            padding: "4px 8px", fontSize: 14, background: "none",
            border: "1px solid #e0e0da", borderRadius: 5, cursor: "pointer",
            color: "#888", fontFamily: "inherit", lineHeight: 1,
          }}>{"\u2630"}</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
            ICH Wiki
          </span>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {!activeChat || activeChat.messages.length === 0 ? (
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", padding: "40px 20px", textAlign: "center",
            }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", marginBottom: 6, letterSpacing: -0.5 }}>
                ICH Wiki
              </div>
              <p style={{ fontSize: 13, color: "#888", maxWidth: 400, lineHeight: 1.6, marginBottom: 28 }}>
                Your regulatory intelligence assistant for ICH Q-series guidelines.
              </p>
              <div className="suggestions-grid">
                {[
                  "What are the accelerated stability storage conditions?",
                  "GMP training requirements for API manufacturing?",
                  "Class 1 elemental impurities and their PDEs?",
                  "Significant change criteria for drug products?",
                  "Process validation batch requirements?",
                  "Design space and control strategy relationship?",
                ].map(q => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }} className="suggestion-btn">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages-container">
              {activeChat.messages.map((msg, i) => (
                <div key={i} style={{ marginBottom: 20, display: "flex", gap: 10 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: msg.role === "user" ? "#e0ddd5" : "#c8dcc8",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 600,
                    color: msg.role === "user" ? "#666" : "#3a6a3a",
                    marginTop: 2,
                  }}>
                    {msg.role === "user" ? "Y" : "Q"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 3 }}>
                      {msg.role === "user" ? "You" : "ICH Wiki"}
                    </div>
                    <div style={{
                      fontSize: 14, lineHeight: 1.7, color: "#1a1a1a",
                      whiteSpace: "pre-wrap", wordBreak: "break-word",
                    }}>
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    background: "#c8dcc8", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 11, fontWeight: 600, color: "#3a6a3a",
                  }}>Q</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#999", marginBottom: 3 }}>ICH Wiki</div>
                    <div style={{ fontSize: 13, color: "#999", display: "flex", alignItems: "center", gap: 8 }}>
                      <span className="loading-dot-container">
                        <span className="loading-dot" style={{ animationDelay: "0s" }} />
                        <span className="loading-dot" style={{ animationDelay: "0.15s" }} />
                        <span className="loading-dot" style={{ animationDelay: "0.3s" }} />
                      </span>
                      <span className="loading-phrase">{loadingPhrase}</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="input-container">
          <div className="input-box">
            <textarea
              ref={inputRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask about ICH guidelines..."
              rows={1}
              style={{
                flex: 1, border: "none", outline: "none", resize: "none",
                fontSize: 14, fontFamily: "inherit", color: "#1a1a1a",
                background: "transparent", padding: "8px 0",
                lineHeight: 1.5, maxHeight: 140,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: input.trim() && !loading ? "#1a1a1a" : "#e8e8e4",
                color: input.trim() && !loading ? "#fff" : "#bbb",
                border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0, transition: "background 0.15s",
              }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(-90deg)" }}>
                <path d="M8 2L14 8L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 8H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; }
        textarea::placeholder { color: #bbb; }
        button:hover { opacity: 0.92; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }

        /* Sidebar */
        .sidebar {
          width: 260px; min-width: 260px;
          background: #eeeee8; border-right: 1px solid #ddd;
          display: flex; flex-direction: column;
          transition: transform 0.2s ease;
          z-index: 20;
        }
        .sidebar-overlay { display: none; }

        /* Messages */
        .messages-container {
          max-width: 680px; margin: 0 auto; padding: 20px 20px;
        }

        /* Input */
        .input-container {
          padding: 10px 16px 14px; background: #f9f9f7; flex-shrink: 0;
        }
        .input-box {
          max-width: 680px; margin: 0 auto;
          background: #fff; border-radius: 12;
          border: 1px solid #d8d8d0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.04);
          display: flex; align-items: flex-end;
          padding: 6px 6px 6px 16px;
          border-radius: 12px;
        }

        /* Suggestions */
        .suggestions-grid {
          display: flex; flex-wrap: wrap; gap: 8px;
          justify-content: center; max-width: 520px;
        }
        .suggestion-btn {
          padding: 8px 14px; font-size: 12px; font-family: inherit;
          background: #fff; color: #555; border: 1px solid #e0e0da;
          border-radius: 20px; cursor: pointer; line-height: 1.4;
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
          max-width: 240px; text-align: left;
        }

        /* Loading dots */
        .loading-dot-container { display: flex; gap: 3px; align-items: center; }
        .loading-dot {
          width: 5px; height: 5px; border-radius: 50%;
          background: #999; animation: dotPulse 1s ease-in-out infinite;
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
        .loading-phrase {
          font-style: italic; animation: fadePhrase 2.2s ease-in-out infinite;
        }
        @keyframes fadePhrase {
          0% { opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { opacity: 0; }
        }

        /* Mobile */
        @media (max-width: 768px) {
          .sidebar {
            position: fixed; top: 0; left: 0; bottom: 0;
            transform: translateX(-100%);
          }
          .sidebar.open { transform: translateX(0); }
          .sidebar-overlay {
            display: block; position: fixed; inset: 0;
            background: rgba(0,0,0,0.3); z-index: 15;
          }
          .messages-container { padding: 16px 14px; }
          .input-container { padding: 8px 10px 12px; }
          .suggestions-grid { gap: 6px; padding: 0 10px; }
          .suggestion-btn { font-size: 11px; padding: 7px 12px; max-width: 100%; }
        }
      `}</style>
    </div>
  );
}
