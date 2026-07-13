import React, { useState, useRef, useMemo, useEffect } from "react";
import { Plus, Trash2, GripVertical, RotateCcw, CalendarDays, Tag, X } from "lucide-react";

const INK = "#E7E9F5";
const INK_DIM = "#9AA0C4";
const INK_FAINT = "#5E6488";
const BG = "#12172B";
const PANEL = "#1A2036";
const PANEL_HOVER = "#212843";
const LINE = "#2B3252";
const AMBER = "#A78BFA";
const AMBER_DIM = "#2B2650";
const TEAL = "#7FC8D8";
const RED = "#E2726F";
const ON_ACCENT = "#1A1330";

const IMPORTANCE_LEVELS = [
  { value: 1, label: "Low" },
  { value: 3, label: "Medium" },
  { value: 5, label: "High" },
];

// cycling palette for user-created tags, {bg, text} pairs, tuned to the navy/lilac theme
const TAG_PALETTE = [
  { bg: "#2B2650", text: "#B9A3F5" }, // lilac
  { bg: "#1B3A42", text: "#7FC8D8" }, // teal
  { bg: "#1F2A4A", text: "#8FA8E8" }, // blue
  { bg: "#402A44", text: "#D19BD8" }, // plum
  { bg: "#3A2F1F", text: "#D8B87F" }, // brass
  { bg: "#2A3A22", text: "#A3D18B" }, // sage
];

function hashTag(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return h % TAG_PALETTE.length;
}

function tagColor(tag) {
  return TAG_PALETTE[hashTag(tag)];
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr + "T00:00:00");
  return Math.round((due - today) / 86400000);
}

function computeScore(task) {
  const importancePoints = task.importance * 16; // max 80
  let urgencyPoints = 0;
  const d = daysUntil(task.dueDate);
  if (d !== null) {
    if (d <= 0) urgencyPoints = 40;
    else urgencyPoints = Math.max(0, 40 - d * 3);
  }
  return Math.round(importancePoints + urgencyPoints);
}

function dueLabel(dateStr) {
  const d = daysUntil(dateStr);
  if (d === null) return null;
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, tone: "red" };
  if (d === 0) return { text: "Due today", tone: "amber" };
  if (d === 1) return { text: "Due tomorrow", tone: "amber" };
  return { text: `Due in ${d}d`, tone: "dim" };
}

let idCounter = 1;
function makeId() {
  return `t${idCounter++}-${Date.now().toString(36)}`;
}

const SEED_TASKS = [
  { id: makeId(), title: "Reply to client proposal email", importance: 5, dueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), done: false, tags: ["work"] },
  { id: makeId(), title: "Refill prescription", importance: 3, dueDate: null, done: false, tags: ["personal"] },
  { id: makeId(), title: "Draft Q3 roadmap outline", importance: 3, dueDate: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10), done: false, tags: ["work"] },
  { id: makeId(), title: "Book dentist appointment", importance: 1, dueDate: null, done: false, tags: ["personal"] },
];

const SEED_TAGS = ["work", "personal"];

function toneColor(tone) {
  if (tone === "red") return RED;
  if (tone === "amber") return AMBER;
  return INK_FAINT;
}

const STORAGE_KEY = "task-organizer:tasks";
const ORDER_KEY = "task-organizer:manual-order";
const TAGS_KEY = "task-organizer:tags";

function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_TASKS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.map((t) => ({ tags: [], ...t }));
    return SEED_TASKS;
  } catch {
    return SEED_TASKS;
  }
}

function loadManualOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function loadTags() {
  try {
    const raw = localStorage.getItem(TAGS_KEY);
    if (!raw) return SEED_TAGS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_TAGS;
  } catch {
    return SEED_TAGS;
  }
}

export default function PriorityTaskManager() {
  const [tasks, setTasks] = useState(loadTasks);
  const [manualOrder, setManualOrder] = useState(loadManualOrder); // array of ids, or null = auto
  const [allTags, setAllTags] = useState(loadTags);
  const [filterTag, setFilterTag] = useState(null);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // storage unavailable - fail silently
    }
  }, [tasks]);

  useEffect(() => {
    try {
      if (manualOrder) localStorage.setItem(ORDER_KEY, JSON.stringify(manualOrder));
      else localStorage.removeItem(ORDER_KEY);
    } catch {
      // storage unavailable - fail silently
    }
  }, [manualOrder]);

  useEffect(() => {
    try {
      localStorage.setItem(TAGS_KEY, JSON.stringify(allTags));
    } catch {
      // storage unavailable - fail silently
    }
  }, [allTags]);

  const [title, setTitle] = useState("");
  const [importance, setImportance] = useState(3);
  const [dueDate, setDueDate] = useState("");
  const [draftTags, setDraftTags] = useState([]);
  const [tagInput, setTagInput] = useState("");
  const dragId = useRef(null);
  const [dragOverId, setDragOverId] = useState(null);

  const scored = useMemo(() => {
    return tasks.map((t) => ({ ...t, score: computeScore(t) }));
  }, [tasks]);

  const filteredScored = useMemo(() => {
    if (!filterTag) return scored;
    return scored.filter((t) => (t.tags || []).includes(filterTag));
  }, [scored, filterTag]);

  const orderedActive = useMemo(() => {
    const active = filteredScored.filter((t) => !t.done);
    if (manualOrder) {
      const byId = Object.fromEntries(active.map((t) => [t.id, t]));
      const inOrder = manualOrder.map((id) => byId[id]).filter(Boolean);
      const missing = active.filter((t) => !manualOrder.includes(t.id));
      return [...inOrder, ...missing];
    }
    return [...active].sort((a, b) => b.score - a.score);
  }, [filteredScored, manualOrder]);

  const done = useMemo(() => filteredScored.filter((t) => t.done), [filteredScored]);

  function commitTagInput() {
    const clean = tagInput.trim().toLowerCase();
    if (!clean) return;
    setAllTags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setDraftTags((prev) => (prev.includes(clean) ? prev : [...prev, clean]));
    setTagInput("");
  }

  function toggleDraftTag(tag) {
    setDraftTags((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));
  }

  function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const t = { id: makeId(), title: title.trim(), importance, dueDate: dueDate || null, done: false, tags: draftTags };
    setTasks((prev) => [...prev, t]);
    setTitle("");
    setDueDate("");
    setImportance(3);
    setDraftTags([]);
    setTagInput("");
  }

  function toggleDone(id) {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function removeTask(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setManualOrder((prev) => (prev ? prev.filter((x) => x !== id) : prev));
  }

  function resetToAuto() {
    setManualOrder(null);
  }

  function handleDrop(targetId) {
    if (!dragId.current || dragId.current === targetId) {
      setDragOverId(null);
      return;
    }
    const currentOrder = manualOrder || orderedActive.map((t) => t.id);
    const withoutDragged = currentOrder.filter((id) => id !== dragId.current);
    const targetIndex = withoutDragged.indexOf(targetId);
    withoutDragged.splice(targetIndex, 0, dragId.current);
    setManualOrder(withoutDragged);
    dragId.current = null;
    setDragOverId(null);
  }

  return (
    <div style={{ background: BG, color: INK, minHeight: "100vh", width: "100%", boxSizing: "border-box", padding: "32px 20px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.14em", color: AMBER, fontWeight: 600, marginBottom: 6 }}>
              PRIORITY QUEUE
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Today's tasks</h1>
          </div>
          {manualOrder && (
            <button
              onClick={resetToAuto}
              style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${LINE}`, color: INK_DIM, fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer" }}
            >
              <RotateCcw size={13} /> Auto-sort
            </button>
          )}
        </div>
        <p style={{ color: INK_DIM, fontSize: 13, marginTop: 0, marginBottom: 16 }}>
          Sorted by importance and deadline. Drag any task to reorder it manually.
        </p>

        {allTags.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            <button
              onClick={() => setFilterTag(null)}
              style={{
                fontSize: 12,
                padding: "5px 10px",
                borderRadius: 6,
                border: `1px solid ${!filterTag ? AMBER : LINE}`,
                background: !filterTag ? AMBER_DIM : "transparent",
                color: !filterTag ? AMBER : INK_DIM,
                cursor: "pointer",
              }}
            >
              All
            </button>
            {allTags.map((tag) => {
              const c = tagColor(tag);
              const active = filterTag === tag;
              return (
                <button
                  key={tag}
                  onClick={() => setFilterTag(active ? null : tag)}
                  style={{
                    fontSize: 12,
                    padding: "5px 10px",
                    borderRadius: 6,
                    border: `1px solid ${active ? c.text : LINE}`,
                    background: active ? c.bg : "transparent",
                    color: active ? c.text : INK_DIM,
                    cursor: "pointer",
                  }}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        )}

        <form onSubmit={addTask} style={{ background: PANEL, border: `1px solid ${LINE}`, borderRadius: 10, padding: 16, marginBottom: 28, display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a task..."
            style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 8, padding: "10px 12px", color: INK, fontSize: 14, outline: "none" }}
          />

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            <Tag size={13} color={INK_FAINT} />
            {allTags.map((tag) => {
              const c = tagColor(tag);
              const on = draftTags.includes(tag);
              return (
                <button
                  type="button"
                  key={tag}
                  onClick={() => toggleDraftTag(tag)}
                  style={{
                    fontSize: 11,
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: `1px solid ${on ? c.text : LINE}`,
                    background: on ? c.bg : "transparent",
                    color: on ? c.text : INK_FAINT,
                    cursor: "pointer",
                  }}
                >
                  {tag}
                </button>
              );
            })}
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTagInput();
                }
              }}
              placeholder="new tag + enter"
              style={{ background: "transparent", border: "none", color: INK_DIM, fontSize: 11, outline: "none", width: 100 }}
            />
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {IMPORTANCE_LEVELS.map((lvl) => (
                <button
                  type="button"
                  key={lvl.value}
                  onClick={() => setImportance(lvl.value)}
                  style={{
                    fontSize: 12,
                    padding: "6px 10px",
                    borderRadius: 7,
                    border: `1px solid ${importance === lvl.value ? AMBER : LINE}`,
                    background: importance === lvl.value ? AMBER_DIM : "transparent",
                    color: importance === lvl.value ? AMBER : INK_DIM,
                    cursor: "pointer",
                  }}
                >
                  {lvl.label}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}>
              <CalendarDays size={14} color={INK_FAINT} />
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                style={{ background: BG, border: `1px solid ${LINE}`, borderRadius: 7, padding: "6px 8px", color: INK_DIM, fontSize: 12, outline: "none" }}
              />
            </div>
            <button
              type="submit"
              style={{ display: "flex", alignItems: "center", gap: 6, background: AMBER, color: ON_ACCENT, border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
            >
              <Plus size={14} /> Add
            </button>
          </div>
        </form>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {orderedActive.length === 0 && (
            <div style={{ color: INK_FAINT, fontSize: 13, textAlign: "center", padding: "24px 0" }}>No tasks yet — add one above.</div>
          )}
          {orderedActive.map((t) => {
            const due = dueLabel(t.dueDate);
            const barPct = Math.min(100, Math.round((t.score / 120) * 100));
            const isOver = dragOverId === t.id;
            return (
              <div
                key={t.id}
                draggable
                onDragStart={() => (dragId.current = t.id)}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverId(t.id);
                }}
                onDragLeave={() => setDragOverId((cur) => (cur === t.id ? null : cur))}
                onDrop={() => handleDrop(t.id)}
                style={{
                  background: isOver ? PANEL_HOVER : PANEL,
                  border: `1px solid ${isOver ? AMBER : LINE}`,
                  borderRadius: 8,
                  padding: "12px 14px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <span style={{ cursor: "grab", color: INK_FAINT, display: "flex" }}>
                  <GripVertical size={15} />
                </span>
                <input type="checkbox" checked={t.done} onChange={() => toggleDone(t.id)} style={{ width: 16, height: 16, accentColor: TEAL, cursor: "pointer" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: INK, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ width: 50, height: 5, borderRadius: 6, background: LINE, overflow: "hidden" }}>
                      <div style={{ width: `${barPct}%`, height: "100%", background: AMBER }} />
                    </div>
                    {due && <span style={{ fontSize: 11, color: toneColor(due.tone) }}>{due.text}</span>}
                    {(t.tags || []).map((tag) => {
                      const c = tagColor(tag);
                      return (
                        <span key={tag} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 6, background: c.bg, color: c.text }}>
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <button onClick={() => removeTask(t.id)} style={{ background: "transparent", border: "none", color: INK_FAINT, cursor: "pointer", display: "flex" }} aria-label="Delete task">
                  <Trash2 size={15} />
                </button>
              </div>
            );
          })}
        </div>

        {done.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, letterSpacing: "0.1em", color: INK_FAINT, marginBottom: 10 }}>DONE — {done.length}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {done.map((t) => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 10 }}>
                  <input type="checkbox" checked={t.done} onChange={() => toggleDone(t.id)} style={{ width: 16, height: 16, accentColor: TEAL, cursor: "pointer" }} />
                  <div style={{ flex: 1, fontSize: 14, color: INK_FAINT, textDecoration: "line-through" }}>{t.title}</div>
                  <button onClick={() => removeTask(t.id)} style={{ background: "transparent", border: "none", color: INK_FAINT, cursor: "pointer", display: "flex" }} aria-label="Delete task">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}