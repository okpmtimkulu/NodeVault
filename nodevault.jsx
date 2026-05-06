import { useState, useEffect, useCallback, useRef } from "react";

// ─── MOCK DATA ENGINE ───────────────────────────────────────────────────────
// Simulates what the real NodeVault daemon would report
const generateProjects = () => {
  const frameworks = ["React", "Next.js", "Vue", "Nuxt", "Svelte", "Express", "Remix", "Astro"];
  const statuses = ["active", "stale", "archived"];
  const names = [
    "ai-chatbot-v2", "saas-dashboard", "portfolio-site", "crm-automation",
    "invoice-generator", "lead-tracker", "booking-app", "analytics-engine",
    "webhook-handler", "email-templates", "payment-gateway", "auth-service",
    "blog-platform", "landing-page-builder", "api-proxy", "task-manager",
    "social-scheduler", "form-builder", "pdf-generator", "notification-service"
  ];
  
  return names.map((name, i) => {
    const nodeModulesSize = Math.floor(Math.random() * 450 + 80);
    const uniquePackages = Math.floor(Math.random() * 600 + 50);
    const sharedPackages = Math.floor(uniquePackages * (Math.random() * 0.6 + 0.3));
    const lastAccessed = new Date(Date.now() - Math.random() * 180 * 24 * 60 * 60 * 1000);
    const status = lastAccessed < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) ? "archived" :
                   lastAccessed < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) ? "stale" : "active";
    
    return {
      id: i,
      name,
      path: `~/Projects/${name}`,
      framework: frameworks[Math.floor(Math.random() * frameworks.length)],
      nodeModulesSize,
      uniquePackages,
      sharedPackages,
      duplicateSize: Math.floor(sharedPackages * 0.4),
      lastAccessed,
      status,
      packageManager: Math.random() > 0.3 ? "npm" : "yarn",
      linked: Math.random() > 0.6,
    };
  }).sort((a, b) => b.nodeModulesSize - a.nodeModulesSize);
};

const PROJECTS = generateProjects();

const totalSize = PROJECTS.reduce((s, p) => s + p.nodeModulesSize, 0);
const saveable = PROJECTS.reduce((s, p) => s + p.duplicateSize, 0);
const staleSize = PROJECTS.filter(p => p.status !== "active").reduce((s, p) => s + p.nodeModulesSize, 0);
const linkedCount = PROJECTS.filter(p => p.linked).length;

// ─── ICONS ──────────────────────────────────────────────────────────────────
const Icons = {
  vault: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/>
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  link: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  refresh: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
    </svg>
  ),
  terminal: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
    </svg>
  ),
  search: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  chart: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  zap: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  ),
  check: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  ),
  x: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  settings: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  ),
  grid: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
};

// ─── HELPERS ────────────────────────────────────────────────────────────────
const formatSize = (mb) => mb >= 1000 ? `${(mb / 1000).toFixed(1)} GB` : `${mb} MB`;
const formatDate = (d) => {
  const days = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
};

const statusColors = {
  active: { bg: "rgba(52, 211, 153, 0.12)", text: "#34d399", dot: "#34d399" },
  stale: { bg: "rgba(251, 191, 36, 0.12)", text: "#fbbf24", dot: "#fbbf24" },
  archived: { bg: "rgba(239, 68, 68, 0.12)", text: "#ef4444", dot: "#ef4444" },
};

// ─── MAIN APP ───────────────────────────────────────────────────────────────
export default function NodeVault() {
  const [view, setView] = useState("dashboard");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [toast, setToast] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalLines, setTerminalLines] = useState([
    { type: "system", text: "NodeVault v1.0.0 — Type 'help' for commands" },
    { type: "prompt", text: "$ " },
  ]);
  const [terminalInput, setTerminalInput] = useState("");
  const termRef = useRef(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filteredProjects = PROJECTS.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                          p.framework.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "all" || p.status === filter;
    return matchesSearch && matchesFilter;
  });

  const handleScan = () => {
    setScanning(true);
    setScanProgress(0);
    const interval = setInterval(() => {
      setScanProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setScanning(false);
          showToast("Scan complete — 20 projects indexed");
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 200);
  };

  const handleLink = (ids) => {
    showToast(`${ids.size || 1} project(s) linked to central store`);
    setSelected(new Set());
  };

  const handleClean = (ids) => {
    showToast(`Cleaned ${formatSize(PROJECTS.filter(p => ids.has(p.id)).reduce((s, p) => s + p.duplicateSize, 0))} of duplicates`);
    setSelected(new Set());
  };

  const handleTerminalSubmit = (e) => {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd) return;
    
    const newLines = [...terminalLines.slice(0, -1)];
    newLines.push({ type: "input", text: `$ ${cmd}` });
    
    const commands = {
      help: () => [
        { type: "output", text: "Available commands:" },
        { type: "output", text: "  scan [path]     Scan directory for node_modules" },
        { type: "output", text: "  link <project>  Link project to central store" },
        { type: "output", text: "  clean [--all]   Remove duplicate packages" },
        { type: "output", text: "  status          Show store status" },
        { type: "output", text: "  list            List all tracked projects" },
        { type: "output", text: "  prune           Remove stale/archived projects" },
        { type: "output", text: "  clear           Clear terminal" },
      ],
      status: () => [
        { type: "output", text: `Store: ~/.nodevault/store` },
        { type: "output", text: `Total tracked: ${PROJECTS.length} projects` },
        { type: "output", text: `Total size: ${formatSize(totalSize)}` },
        { type: "output", text: `Saveable: ${formatSize(saveable)}` },
        { type: "output", text: `Linked: ${linkedCount}/${PROJECTS.length}` },
        { type: "success", text: `Store healthy ✓` },
      ],
      list: () => PROJECTS.slice(0, 8).map(p => ({
        type: "output",
        text: `  ${p.linked ? "◉" : "○"} ${p.name.padEnd(24)} ${formatSize(p.nodeModulesSize).padStart(8)}  ${p.status}`,
      })).concat([{ type: "output", text: `  ... and ${PROJECTS.length - 8} more` }]),
      scan: () => [
        { type: "output", text: "Scanning ~/Projects..." },
        { type: "output", text: `Found ${PROJECTS.length} projects with node_modules` },
        { type: "output", text: `Total: ${formatSize(totalSize)} | Duplicates: ${formatSize(saveable)}` },
        { type: "success", text: "Scan complete ✓" },
      ],
      clean: () => [
        { type: "output", text: "Analyzing duplicate packages..." },
        { type: "output", text: `Removing ${formatSize(saveable)} of shared dependencies...` },
        { type: "success", text: `Cleaned! Saved ${formatSize(saveable)} ✓` },
      ],
      link: () => [
        { type: "output", text: "Linking project to central store..." },
        { type: "output", text: "Creating hardlinks for 347 packages..." },
        { type: "success", text: "Project linked successfully ✓" },
      ],
      prune: () => [
        { type: "output", text: `Found ${PROJECTS.filter(p => p.status !== "active").length} stale/archived projects` },
        { type: "output", text: `Removing ${formatSize(staleSize)} of unused node_modules...` },
        { type: "success", text: "Pruned! ✓" },
      ],
      clear: () => "clear",
    };

    const handler = commands[cmd.split(" ")[0]];
    if (cmd.split(" ")[0] === "clear") {
      setTerminalLines([
        { type: "system", text: "NodeVault v1.0.0" },
        { type: "prompt", text: "$ " },
      ]);
      setTerminalInput("");
      return;
    }
    
    if (handler) {
      const result = handler();
      if (result !== "clear") newLines.push(...result);
    } else {
      newLines.push({ type: "error", text: `Unknown command: ${cmd}. Type 'help' for available commands.` });
    }
    
    newLines.push({ type: "prompt", text: "$ " });
    setTerminalLines(newLines);
    setTerminalInput("");
  };

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [terminalLines]);

  // ─── SIZE CHART DATA ────────────────────────────────────────────────────
  const topProjects = PROJECTS.slice(0, 8);
  const maxSize = Math.max(...topProjects.map(p => p.nodeModulesSize));

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0b",
      color: "#e4e4e7",
      fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
      position: "relative",
      overflow: "hidden",
    }}>
      {/* Ambient grid */}
      <div style={{
        position: "fixed", inset: 0, opacity: 0.03, pointerEvents: "none",
        backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
        backgroundSize: "40px 40px",
      }}/>
      
      {/* Glow accent */}
      <div style={{
        position: "fixed", top: -200, right: -200, width: 600, height: 600,
        background: "radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%)",
        pointerEvents: "none",
      }}/>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, right: 20, zIndex: 1000,
          background: toast.type === "success" ? "rgba(16, 185, 129, 0.15)" : "rgba(239, 68, 68, 0.15)",
          border: `1px solid ${toast.type === "success" ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
          color: toast.type === "success" ? "#34d399" : "#ef4444",
          padding: "10px 16px", borderRadius: 8, fontSize: 12,
          backdropFilter: "blur(12px)",
          animation: "fadeIn 0.2s ease",
        }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <header style={{
        padding: "16px 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        background: "rgba(10, 10, 11, 0.8)",
        backdropFilter: "blur(20px)",
        position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            background: "linear-gradient(135deg, #10b981, #059669)",
            borderRadius: 8, padding: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(16, 185, 129, 0.2)",
          }}>
            {Icons.vault}
          </div>
          <div>
            <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em" }}>NodeVault</span>
            <span style={{ fontSize: 10, color: "#6b7280", marginLeft: 8, fontWeight: 400 }}>v1.0.0</span>
          </div>
        </div>

        <nav style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3 }}>
          {[
            { id: "dashboard", label: "Dashboard", icon: Icons.chart },
            { id: "projects", label: "Projects", icon: Icons.folder },
            { id: "cli", label: "CLI", icon: Icons.terminal },
            { id: "settings", label: "Settings", icon: Icons.settings },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setView(tab.id); if (tab.id === "cli") setTerminalOpen(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 14px", borderRadius: 6, border: "none",
                background: view === tab.id ? "rgba(16, 185, 129, 0.15)" : "transparent",
                color: view === tab.id ? "#34d399" : "#6b7280",
                fontSize: 11, fontWeight: 500, cursor: "pointer",
                fontFamily: "inherit", transition: "all 0.15s ease",
              }}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </nav>

        <button onClick={handleScan} disabled={scanning}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 16px", borderRadius: 8, border: "1px solid rgba(16, 185, 129, 0.3)",
            background: scanning ? "rgba(16, 185, 129, 0.1)" : "rgba(16, 185, 129, 0.15)",
            color: "#34d399", fontSize: 11, fontWeight: 600, cursor: scanning ? "wait" : "pointer",
            fontFamily: "inherit",
          }}>
          {Icons.refresh}
          {scanning ? `Scanning ${Math.min(100, Math.floor(scanProgress))}%` : "Scan Projects"}
        </button>
      </header>

      <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 80px" }}>
        
        {/* ─── DASHBOARD VIEW ──────────────────────────────────────────────── */}
        {view === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Stats Row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
              {[
                { label: "Total Size", value: formatSize(totalSize), sub: `${PROJECTS.length} projects`, color: "#e4e4e7", accent: "rgba(255,255,255,0.06)" },
                { label: "Saveable", value: formatSize(saveable), sub: `${Math.floor(saveable / totalSize * 100)}% recoverable`, color: "#10b981", accent: "rgba(16, 185, 129, 0.08)" },
                { label: "Stale Projects", value: PROJECTS.filter(p => p.status !== "active").length, sub: formatSize(staleSize) + " reclaimable", color: "#fbbf24", accent: "rgba(251, 191, 36, 0.08)" },
                { label: "Linked", value: `${linkedCount}/${PROJECTS.length}`, sub: "using central store", color: "#818cf8", accent: "rgba(129, 140, 248, 0.08)" },
              ].map((stat, i) => (
                <div key={i} style={{
                  background: stat.accent,
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: 12, padding: "18px 20px",
                }}>
                  <div style={{ fontSize: 10, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{stat.label}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, color: stat.color, letterSpacing: "-0.03em" }}>{stat.value}</div>
                  <div style={{ fontSize: 10, color: "#52525b", marginTop: 4 }}>{stat.sub}</div>
                </div>
              ))}
            </div>

            {/* Charts Row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {/* Size Chart */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: 20,
              }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16, fontWeight: 600 }}>
                  Largest Projects by node_modules
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {topProjects.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 10, color: "#6b7280", width: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {p.name}
                      </span>
                      <div style={{ flex: 1, height: 18, background: "rgba(255,255,255,0.03)", borderRadius: 4, overflow: "hidden", position: "relative" }}>
                        <div style={{
                          height: "100%",
                          width: `${(p.nodeModulesSize / maxSize * 100)}%`,
                          background: `linear-gradient(90deg, rgba(16, 185, 129, 0.3), rgba(16, 185, 129, ${0.15 + (i / topProjects.length) * 0.2}))`,
                          borderRadius: 4,
                          transition: "width 0.6s ease",
                        }}/>
                        {/* Duplicate portion */}
                        <div style={{
                          position: "absolute", top: 0, left: 0,
                          height: "100%",
                          width: `${(p.duplicateSize / maxSize * 100)}%`,
                          background: "rgba(239, 68, 68, 0.2)",
                          borderRadius: "4px 0 0 4px",
                        }}/>
                      </div>
                      <span style={{ fontSize: 10, color: "#9ca3af", width: 55, textAlign: "right" }}>{formatSize(p.nodeModulesSize)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#6b7280" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(16, 185, 129, 0.3)" }}/> Total Size
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 9, color: "#6b7280" }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: "rgba(239, 68, 68, 0.25)" }}/> Duplicates
                  </div>
                </div>
              </div>

              {/* Status Breakdown */}
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, padding: 20,
              }}>
                <div style={{ fontSize: 11, color: "#9ca3af", marginBottom: 16, fontWeight: 600 }}>
                  Project Health Overview
                </div>
                
                {/* Donut-style breakdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                  <div style={{ position: "relative", width: 120, height: 120 }}>
                    <svg viewBox="0 0 120 120" style={{ transform: "rotate(-90deg)" }}>
                      {(() => {
                        const active = PROJECTS.filter(p => p.status === "active").length;
                        const stale = PROJECTS.filter(p => p.status === "stale").length;
                        const archived = PROJECTS.filter(p => p.status === "archived").length;
                        const total = PROJECTS.length;
                        const r = 48, c = 2 * Math.PI * r;
                        let offset = 0;
                        const segments = [
                          { count: active, color: "#34d399" },
                          { count: stale, color: "#fbbf24" },
                          { count: archived, color: "#ef4444" },
                        ];
                        return segments.map((seg, i) => {
                          const pct = seg.count / total;
                          const el = (
                            <circle key={i} cx="60" cy="60" r={r}
                              fill="none" stroke={seg.color} strokeWidth="16"
                              strokeDasharray={`${pct * c} ${c}`}
                              strokeDashoffset={-offset}
                              style={{ opacity: 0.7 }}
                            />
                          );
                          offset += pct * c;
                          return el;
                        });
                      })()}
                    </svg>
                    <div style={{
                      position: "absolute", inset: 0,
                      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontSize: 22, fontWeight: 700 }}>{PROJECTS.length}</span>
                      <span style={{ fontSize: 9, color: "#6b7280" }}>projects</span>
                    </div>
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                    {[
                      { label: "Active", count: PROJECTS.filter(p => p.status === "active").length, color: "#34d399", desc: "Used in last 30 days" },
                      { label: "Stale", count: PROJECTS.filter(p => p.status === "stale").length, color: "#fbbf24", desc: "30-90 days inactive" },
                      { label: "Archived", count: PROJECTS.filter(p => p.status === "archived").length, color: "#ef4444", desc: "90+ days inactive" },
                    ].map((item, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.color }}/>
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
                            <div style={{ fontSize: 9, color: "#52525b" }}>{item.desc}</div>
                          </div>
                        </div>
                        <span style={{ fontSize: 16, fontWeight: 700, color: item.color }}>{item.count}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
                  <button onClick={() => showToast("Auto-cleanup started...")} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8,
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    background: "rgba(16, 185, 129, 0.08)",
                    color: "#34d399", fontSize: 10, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    {Icons.zap} Auto Clean
                  </button>
                  <button onClick={() => showToast("Linking all unlinked projects...")} style={{
                    flex: 1, padding: "8px 12px", borderRadius: 8,
                    border: "1px solid rgba(129, 140, 248, 0.2)",
                    background: "rgba(129, 140, 248, 0.08)",
                    color: "#818cf8", fontSize: 10, fontWeight: 600, cursor: "pointer",
                    fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}>
                    {Icons.link} Link All
                  </button>
                </div>
              </div>
            </div>

            {/* CLI Preview */}
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600 }}>Quick Start — CLI Commands</div>
                <button onClick={() => setView("cli")} style={{
                  background: "none", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#6b7280", fontSize: 10, padding: "4px 10px", borderRadius: 6,
                  cursor: "pointer", fontFamily: "inherit",
                }}>
                  Open Terminal →
                </button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {[
                  { cmd: "npx nodevault scan ~/Projects", desc: "Discover all node_modules" },
                  { cmd: "npx nodevault link --all", desc: "Link everything to central store" },
                  { cmd: "npx nodevault clean --duplicates", desc: "Remove duplicate packages" },
                  { cmd: "npx nodevault prune --stale", desc: "Clean inactive projects" },
                  { cmd: "npx nodevault status", desc: "View store health" },
                  { cmd: "npx nodevault watch", desc: "Auto-manage new projects" },
                ].map((item, i) => (
                  <div key={i} style={{
                    background: "rgba(0,0,0,0.3)", borderRadius: 8, padding: "10px 12px",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}>
                    <code style={{ fontSize: 10, color: "#10b981", display: "block", marginBottom: 4 }}>{item.cmd}</code>
                    <div style={{ fontSize: 9, color: "#52525b" }}>{item.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ─── PROJECTS VIEW ─────────────────────────────────────────────── */}
        {view === "projects" && (
          <div>
            {/* Toolbar */}
            <div style={{
              display: "flex", alignItems: "center", gap: 10, marginBottom: 16,
              flexWrap: "wrap",
            }}>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(255,255,255,0.04)", borderRadius: 8,
                padding: "6px 12px", flex: "1 1 200px",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                {Icons.search}
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search projects..."
                  style={{
                    background: "none", border: "none", outline: "none", color: "#e4e4e7",
                    fontSize: 11, fontFamily: "inherit", width: "100%",
                  }}
                />
              </div>

              <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3 }}>
                {["all", "active", "stale", "archived"].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{
                    padding: "5px 12px", borderRadius: 6, border: "none",
                    background: filter === f ? "rgba(255,255,255,0.08)" : "transparent",
                    color: filter === f ? "#e4e4e7" : "#6b7280",
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    textTransform: "capitalize", fontWeight: 500,
                  }}>{f}</button>
                ))}
              </div>

              <div style={{ display: "flex", gap: 2, background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: 3 }}>
                <button onClick={() => setViewMode("list")} style={{
                  padding: "5px 8px", borderRadius: 5, border: "none",
                  background: viewMode === "list" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: viewMode === "list" ? "#e4e4e7" : "#6b7280",
                  cursor: "pointer", display: "flex",
                }}>{Icons.list}</button>
                <button onClick={() => setViewMode("grid")} style={{
                  padding: "5px 8px", borderRadius: 5, border: "none",
                  background: viewMode === "grid" ? "rgba(255,255,255,0.08)" : "transparent",
                  color: viewMode === "grid" ? "#e4e4e7" : "#6b7280",
                  cursor: "pointer", display: "flex",
                }}>{Icons.grid}</button>
              </div>

              {selected.size > 0 && (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => handleLink(selected)} style={{
                    padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(16, 185, 129, 0.3)",
                    background: "rgba(16, 185, 129, 0.1)", color: "#34d399",
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>{Icons.link} Link ({selected.size})</button>
                  <button onClick={() => handleClean(selected)} style={{
                    padding: "6px 12px", borderRadius: 6, border: "1px solid rgba(239, 68, 68, 0.3)",
                    background: "rgba(239, 68, 68, 0.1)", color: "#ef4444",
                    fontSize: 10, cursor: "pointer", fontFamily: "inherit",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>{Icons.trash} Clean ({selected.size})</button>
                </div>
              )}
            </div>

            {/* Project List */}
            {viewMode === "list" ? (
              <div style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
                borderRadius: 12, overflow: "hidden",
              }}>
                {/* Header */}
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr 80px 80px 80px 70px 60px 90px",
                  padding: "10px 16px", gap: 8,
                  borderBottom: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 9, color: "#52525b", textTransform: "uppercase", letterSpacing: "0.06em",
                }}>
                  <div></div>
                  <div>Project</div>
                  <div style={{ textAlign: "right" }}>Size</div>
                  <div style={{ textAlign: "right" }}>Packages</div>
                  <div style={{ textAlign: "right" }}>Duplicates</div>
                  <div>Status</div>
                  <div>Linked</div>
                  <div style={{ textAlign: "right" }}>Last Used</div>
                </div>

                {filteredProjects.map(p => (
                  <div key={p.id}
                    onClick={() => {
                      const next = new Set(selected);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      setSelected(next);
                    }}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "32px 1fr 80px 80px 80px 70px 60px 90px",
                      padding: "10px 16px", gap: 8,
                      borderBottom: "1px solid rgba(255,255,255,0.03)",
                      cursor: "pointer",
                      background: selected.has(p.id) ? "rgba(16, 185, 129, 0.06)" : "transparent",
                      transition: "background 0.1s ease",
                      alignItems: "center",
                    }}>
                    <div>
                      <div style={{
                        width: 16, height: 16, borderRadius: 4,
                        border: `1.5px solid ${selected.has(p.id) ? "#10b981" : "rgba(255,255,255,0.15)"}`,
                        background: selected.has(p.id) ? "rgba(16, 185, 129, 0.2)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>
                        {selected.has(p.id) && Icons.check}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#e4e4e7" }}>{p.name}</div>
                      <div style={{ fontSize: 9, color: "#52525b" }}>{p.path} · {p.framework} · {p.packageManager}</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 12, fontWeight: 600, color: p.nodeModulesSize > 300 ? "#ef4444" : "#e4e4e7" }}>
                      {formatSize(p.nodeModulesSize)}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, color: "#9ca3af" }}>{p.uniquePackages}</div>
                    <div style={{ textAlign: "right", fontSize: 11, color: p.duplicateSize > 100 ? "#fbbf24" : "#52525b" }}>
                      {formatSize(p.duplicateSize)}
                    </div>
                    <div>
                      <span style={{
                        fontSize: 9, padding: "2px 8px", borderRadius: 99,
                        background: statusColors[p.status].bg,
                        color: statusColors[p.status].text,
                        fontWeight: 600,
                      }}>
                        {p.status}
                      </span>
                    </div>
                    <div>
                      {p.linked ? (
                        <span style={{ color: "#10b981", display: "flex", alignItems: "center", gap: 4, fontSize: 10 }}>
                          {Icons.check} Yes
                        </span>
                      ) : (
                        <span style={{ color: "#52525b", fontSize: 10 }}>—</span>
                      )}
                    </div>
                    <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280" }}>{formatDate(p.lastAccessed)}</div>
                  </div>
                ))}
              </div>
            ) : (
              /* Grid View */
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {filteredProjects.map(p => (
                  <div key={p.id}
                    onClick={() => {
                      const next = new Set(selected);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      setSelected(next);
                    }}
                    style={{
                      background: selected.has(p.id) ? "rgba(16, 185, 129, 0.06)" : "rgba(255,255,255,0.02)",
                      border: `1px solid ${selected.has(p.id) ? "rgba(16, 185, 129, 0.2)" : "rgba(255,255,255,0.06)"}`,
                      borderRadius: 12, padding: 16, cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: 9, color: "#52525b", marginTop: 2 }}>{p.framework} · {p.packageManager}</div>
                      </div>
                      <span style={{
                        fontSize: 8, padding: "2px 6px", borderRadius: 99,
                        background: statusColors[p.status].bg,
                        color: statusColors[p.status].text,
                        fontWeight: 600,
                      }}>{p.status}</span>
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                      <div>
                        <div style={{ fontSize: 9, color: "#6b7280" }}>Size</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: p.nodeModulesSize > 300 ? "#ef4444" : "#e4e4e7" }}>
                          {formatSize(p.nodeModulesSize)}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, color: "#6b7280" }}>Duplicates</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fbbf24" }}>{formatSize(p.duplicateSize)}</div>
                      </div>
                    </div>
                    
                    <div style={{
                      height: 4, background: "rgba(255,255,255,0.04)", borderRadius: 2,
                      marginTop: 12, overflow: "hidden",
                    }}>
                      <div style={{
                        height: "100%", borderRadius: 2,
                        width: `${(p.duplicateSize / p.nodeModulesSize * 100)}%`,
                        background: "linear-gradient(90deg, #ef4444, #fbbf24)",
                      }}/>
                    </div>
                    <div style={{ fontSize: 8, color: "#52525b", marginTop: 4 }}>
                      {Math.floor(p.duplicateSize / p.nodeModulesSize * 100)}% duplicate · {formatDate(p.lastAccessed)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── CLI VIEW ──────────────────────────────────────────────────── */}
        {view === "cli" && (
          <div style={{
            background: "rgba(0, 0, 0, 0.5)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12, overflow: "hidden",
            height: "calc(100vh - 160px)",
            display: "flex", flexDirection: "column",
          }}>
            {/* Terminal header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 8, padding: "10px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
            }}>
              <div style={{ display: "flex", gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ef4444" }}/>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fbbf24" }}/>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#22c55e" }}/>
              </div>
              <span style={{ fontSize: 11, color: "#6b7280", marginLeft: 8 }}>nodevault — bash</span>
            </div>

            {/* Terminal body */}
            <div ref={termRef} style={{
              flex: 1, overflow: "auto", padding: 16,
              fontFamily: "'JetBrains Mono', monospace", fontSize: 12,
            }}>
              {terminalLines.map((line, i) => (
                <div key={i} style={{
                  color: line.type === "system" ? "#6b7280" :
                         line.type === "success" ? "#34d399" :
                         line.type === "error" ? "#ef4444" :
                         line.type === "input" ? "#818cf8" :
                         line.type === "prompt" ? "#10b981" : "#9ca3af",
                  marginBottom: 2,
                  whiteSpace: "pre",
                }}>
                  {line.text}
                </div>
              ))}
            </div>

            {/* Terminal input */}
            <form onSubmit={handleTerminalSubmit} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "10px 16px",
              borderTop: "1px solid rgba(255,255,255,0.06)",
              background: "rgba(255,255,255,0.02)",
            }}>
              <span style={{ color: "#10b981", fontSize: 12 }}>$</span>
              <input value={terminalInput} onChange={e => setTerminalInput(e.target.value)}
                autoFocus
                style={{
                  background: "none", border: "none", outline: "none",
                  color: "#e4e4e7", fontSize: 12, fontFamily: "inherit",
                  flex: 1,
                }}
                placeholder="Type a command... (try 'help')"
              />
            </form>
          </div>
        )}

        {/* ─── SETTINGS VIEW ─────────────────────────────────────────────── */}
        {view === "settings" && (
          <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Store Configuration</div>
              {[
                { label: "Central Store Path", value: "~/.nodevault/store", desc: "Where shared packages are stored" },
                { label: "Linking Strategy", value: "hardlink", desc: "hardlink (default), symlink, or copy" },
                { label: "Auto-scan Interval", value: "6 hours", desc: "How often to check for new projects" },
                { label: "Stale Threshold", value: "30 days", desc: "Mark projects stale after inactivity" },
                { label: "Archive Threshold", value: "90 days", desc: "Mark projects archived after inactivity" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "12px 0",
                  borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 9, color: "#52525b" }}>{item.desc}</div>
                  </div>
                  <div style={{
                    background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "5px 12px",
                    fontSize: 11, color: "#10b981", border: "1px solid rgba(255,255,255,0.06)",
                  }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{
              background: "rgba(255,255,255,0.02)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Auto-Cleanup Rules</div>
              {[
                { label: "Remove node_modules from archived projects", enabled: true },
                { label: "Auto-link new projects on detection", enabled: true },
                { label: "Prune unreferenced packages from store", enabled: false },
                { label: "Watch ~/Projects for new folders", enabled: true },
                { label: "Notify before deleting (require confirmation)", enabled: true },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0",
                  borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
                }}>
                  <span style={{ fontSize: 11 }}>{item.label}</span>
                  <div style={{
                    width: 36, height: 20, borderRadius: 10, cursor: "pointer",
                    background: item.enabled ? "rgba(16, 185, 129, 0.4)" : "rgba(255,255,255,0.1)",
                    position: "relative", transition: "background 0.2s ease",
                  }}>
                    <div style={{
                      width: 16, height: 16, borderRadius: "50%",
                      background: item.enabled ? "#10b981" : "#52525b",
                      position: "absolute", top: 2,
                      left: item.enabled ? 18 : 2,
                      transition: "left 0.2s ease",
                    }}/>
                  </div>
                </div>
              ))}
            </div>

            <div style={{
              background: "rgba(16, 185, 129, 0.04)",
              border: "1px solid rgba(16, 185, 129, 0.1)",
              borderRadius: 12, padding: 20,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: "#34d399" }}>Install NodeVault</div>
              <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 12 }}>Install the CLI globally, then start the daemon for auto-management.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[
                  "npm install -g nodevault",
                  "nodevault init",
                  "nodevault scan ~/Projects",
                  "nodevault daemon start",
                ].map((cmd, i) => (
                  <code key={i} style={{
                    display: "block", background: "rgba(0,0,0,0.3)", padding: "8px 12px",
                    borderRadius: 6, fontSize: 11, color: "#10b981",
                    border: "1px solid rgba(255,255,255,0.04)",
                  }}>{cmd}</code>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Scan progress bar */}
      {scanning && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0, height: 3,
          background: "rgba(255,255,255,0.05)",
        }}>
          <div style={{
            height: "100%",
            width: `${Math.min(100, scanProgress)}%`,
            background: "linear-gradient(90deg, #10b981, #34d399)",
            transition: "width 0.3s ease",
            boxShadow: "0 0 20px rgba(16, 185, 129, 0.5)",
          }}/>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        button:hover { filter: brightness(1.15); }
        input::placeholder { color: #3f3f46; }
      `}</style>
    </div>
  );
}
