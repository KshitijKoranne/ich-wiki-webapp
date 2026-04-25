"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/* ── Types ───────────────────────────────────────────────────────── */
type Message = { role: "user" | "assistant"; content: string };
type Chat = { id: string; title: string; messages: Message[] };

/* ── Main ─────────────────────────────────────────────────────────── */
export default function Home() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = chats.find(c => c.id === activeId) || null;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeChat?.messages.length, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeId]);

  const newChat = useCallback(() => {
    const id = Date.now().toString();
    setChats(prev => [{ id, title: "New chat", messages: [] }, ...prev]);
    setActiveId(id);
    setInput("");
  }, []);

  const deleteChat = useCallback((id: string) => {
    setChats(prev => prev.filter(c => c.id !== id));
    if (activeId === id) {
      setActiveId(null);
    }
  }, [activeId]);

  const send = async () => {
    if (!input.trim() || loading) return;

    let chatId = activeId;

    if (!chatId) {
      const id = Date.now().toString();
      const newC: Chat = { id, title: "New chat", messages: [] };
      setChats(prev => [newC, ...prev]);
      chatId = id;
      setActiveId(id);
    }

    const userMsg: Message = { role: "user", content: input.trim() };
    const currentInput = input.trim();
    setInput("");

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
        return { ...c, messages: [...c.messages, { role: "assistant", content: "Error: " + e.message }] };
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

  // Auto-resize textarea
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  };

  return (
    <div style={{ fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif", background: "#f9f9f7", color: "#1a1a1a", height: "100vh", display: "flex", overflow: "hidden" }}>

      {/* ── Sidebar ──────────────────────────────────────────── */}
      <aside style={{
        width: sidebarOpen ? 260 : 0,
        minWidth: sidebarOpen ? 260 : 0,
        background: "#eeeee8",
        borderRight: "1px solid #ddd",
        display: "flex",
        flexDirection: "column",
        transition: "width 0.2s, min-width 0.2s",
        overflow: "hidden",
      }}>
        {/* New chat button */}
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

        {/* Chat list */}
        <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
          {chats.map(chat => (
            <div key={chat.id} style={{
              display: "flex", alignItems: "center", gap: 4,
              marginBottom: 2,
            }}>
              <button
                onClick={() => { setActiveId(chat.id); }}
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
                padding: "4px 6px", fontSize: 11, background: "none",
                border: "none", color: "#aaa", cursor: "pointer",
                borderRadius: 4, flexShrink: 0,
              }}>&times;</button>
            </div>
          ))}
        </div>

        {/* Sidebar footer */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #ddd", fontSize: 9, color: "#999" }}>
          ICH LLM Wiki · KJR Labs
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <div style={{
          padding: "10px 16px", borderBottom: "1px solid #eee",
          display: "flex", alignItems: "center", gap: 10,
          background: "#fff",
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{
            padding: "4px 8px", fontSize: 14, background: "none",
            border: "1px solid #e0e0da", borderRadius: 5, cursor: "pointer",
            color: "#888", fontFamily: "inherit", lineHeight: 1,
          }}>{sidebarOpen ? "\u2630" : "\u2630"}</button>
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
            ICH Wiki
          </span>
          <span style={{ fontSize: 10, color: "#bbb", fontWeight: 400 }}>
            28 guidelines · AI-powered
          </span>
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflow: "auto", padding: "0" }}>
          {!activeChat || activeChat.messages.length === 0 ? (
            /* Empty state */
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              justifyContent: "center", height: "100%", padding: 40, textAlign: "center",
            }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", marginBottom: 8, letterSpacing: -0.5 }}>
                ICH Wiki
              </div>
              <p style={{ fontSize: 13, color: "#888", maxWidth: 420, lineHeight: 1.6, marginBottom: 28 }}>
                Ask questions about ICH Q-series guidelines. Get authoritative answers grounded in 28 guidelines, 8 concepts, and 4 Q&A documents.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 550 }}>
                {[
                  "What are the accelerated stability conditions per Q1A?",
                  "What training requirements exist per Q7?",
                  "What are Class 1 elemental impurities?",
                  "What is significant change for a drug product?",
                  "What are the three objectives of Q10 PQS?",
                  "What is the batch requirement for stability studies?",
                ].map(q => (
                  <button key={q} onClick={() => { setInput(q); inputRef.current?.focus(); }} style={{
                    padding: "8px 14px", fontSize: 11, fontFamily: "inherit",
                    background: "#fff", color: "#555", border: "1px solid #e0e0da",
                    borderRadius: 20, cursor: "pointer", lineHeight: 1.4,
                    boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    maxWidth: 260, textAlign: "left",
                  }}>{q}</button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "20px 24px" }}>
              {activeChat.messages.map((msg, i) => (
                <div key={i} style={{
                  marginBottom: 24,
                  display: "flex",
                  gap: 12,
                }}>
                  {/* Avatar */}
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: msg.role === "user" ? "#e0ddd5" : "#d4e8d4",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 600, color: msg.role === "user" ? "#666" : "#3a7a3a",
                    marginTop: 2,
                  }}>
                    {msg.role === "user" ? "Y" : "W"}
                  </div>

                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4 }}>
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
                <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                    background: "#d4e8d4", display: "flex", alignItems: "center",
                    justifyContent: "center", fontSize: 12, fontWeight: 600, color: "#3a7a3a",
                  }}>W</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 4 }}>ICH Wiki</div>
                    <div style={{ fontSize: 14, color: "#aaa" }}>
                      <span className="dots">Thinking</span>
                    </div>
                  </div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        <div style={{
          padding: "12px 16px 16px",
          background: "#f9f9f7",
        }}>
          <div style={{
            maxWidth: 720, margin: "0 auto",
            background: "#fff", borderRadius: 12,
            border: "1px solid #d8d8d0",
            boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
            display: "flex", alignItems: "flex-end",
            padding: "6px 6px 6px 16px",
          }}>
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
                lineHeight: 1.5, maxHeight: 160,
              }}
            />
            <button
              onClick={send}
              disabled={loading || !input.trim()}
              style={{
                width: 34, height: 34, borderRadius: 8,
                background: input.trim() && !loading ? "#1a1a1a" : "#e8e8e4",
                color: input.trim() && !loading ? "#fff" : "#bbb",
                border: "none", cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, flexShrink: 0, transition: "background 0.15s",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: "rotate(-90deg)" }}>
                <path d="M8 2L14 8L8 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 8H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
          <p style={{ textAlign: "center", fontSize: 9, color: "#bbb", marginTop: 8 }}>
            Answers grounded in ICH Q-series guidelines. May not cover all edge cases.
          </p>
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; margin: 0; }
        textarea::placeholder { color: #bbb; }
        button:hover { opacity: 0.92; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #ddd; border-radius: 3px; }
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
        .dots::after { content: "..."; animation: blink 1.2s infinite; }
      `}</style>
    </div>
  );
}
