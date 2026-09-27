import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  CaptureUpdateAction,
  convertToExcalidrawElements,
  exportToBlob,
  exportToSvg,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDownToLine,
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  FileImage,
  FileJson,
  FilePlus2,
  FolderOpen,
  Fullscreen,
  Grid2X2,
  HardDrive,
  LayoutTemplate,
  Link,
  LoaderCircle,
  Minimize,
  MonitorUp,
  MoreHorizontal,
  PanelLeft,
  Plus,
  Presentation,
  Scan,
  Shapes,
  Sparkles,
  SquarePen,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
} from "lucide-react";
import {
  createBoard,
  defaults,
  listBoards,
  removeBoard,
  saveBoard,
  savedState,
} from "./board";
import type { Board } from "./board";
import Minimap from "./Minimap";
import { Modal } from "./ui";
import { LiveRoom, offlineRoom } from "./LiveRoom";
import { parseInvite } from "./live-protocol";
import ScreenPreview from "./ScreenPreview";

let initialization: Promise<Board[]> | undefined;
function initialize() {
  initialization ??= listBoards().then(async (boards) => {
    if (boards.length) return boards;
    const blank = createBoard();
    await saveBoard(blank);
    return [blank];
  });
  return initialization;
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  return { url, filename };
}

function MenuItem({
  children,
  onSelect,
  danger = false,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  danger?: boolean;
}) {
  return (
    <DropdownMenu.Item
      className={`menu-item ${danger ? "danger" : ""}`}
      onSelect={onSelect}
    >
      {children}
    </DropdownMenu.Item>
  );
}

export default function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [active, setActive] = useState<Board | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [elements, setElements] = useState<readonly ExcalidrawElement[]>([]);
  const [viewport, setViewport] = useState({
    scrollX: 0,
    scrollY: 0,
    width: 1000,
    height: 700,
    zoom: { value: 1 as AppState["zoom"]["value"] },
  });
  const [sidebar, setSidebar] = useState(false);
  const [overview, setOverview] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [canvasFullscreen, setCanvasFullscreen] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [modal, setModal] = useState<
    "rename" | "delete" | "share" | "help" | null
  >(null);
  const [name, setName] = useState("");
  const [grid, setGrid] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloadInfo, setDownloadInfo] = useState<{
    url: string;
    filename: string;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const [room, setRoom] = useState(offlineRoom);
  const [displayName, setDisplayName] = useState("");
  const [inviteLink, setInviteLink] = useState(() =>
    parseInvite(location.href) ? location.href : "",
  );
  const [joinMode, setJoinMode] = useState(() => !!parseInvite(location.href));
  const [pendingJoin, setPendingJoin] = useState<{
    id: string;
    name: string;
    invite: { host: string; token: string };
  } | null>(null);
  const roomRef = useRef<LiveRoom | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  apiRef.current = api;
  const roomBusy = ["connecting", "hosting", "joined"].includes(room.phase);
  const activeRef = useRef<Board | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const pendingRef = useRef<Board | null>(null);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const lastSignature = useRef("");
  const fitOnLoad = useRef(false);
  const input = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string) => setToast(message), []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  useEffect(
    () => () => {
      if (downloadInfo) URL.revokeObjectURL(downloadInfo.url);
    },
    [downloadInfo],
  );
  useEffect(() => {
    if (ready && parseInvite(location.href)) setModal("share");
  }, [ready]);
  useEffect(() => () => roomRef.current?.destroy(), []);
  useEffect(() => {
    const changed = () => {
      setCanvasFullscreen(!!document.fullscreenElement);
      apiRef.current?.refresh();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.fullscreenElement && !modal)
        setCanvasFullscreen(false);
    };
    document.addEventListener("fullscreenchange", changed);
    window.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      window.removeEventListener("keydown", escape);
    };
  }, [modal]);

  const flush = useCallback(async () => {
    clearTimeout(saveTimer.current);
    const board = pendingRef.current;
    pendingRef.current = null;
    if (!board) return saveQueue.current;
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(async () => {
        try {
          await saveBoard(board);
          setBoards((previous) =>
            previous.map((item) => (item.id === board.id ? board : item)),
          );
          if (activeRef.current?.id === board.id && !pendingRef.current)
            setStatus("saved");
        } catch {
          if (!pendingRef.current) pendingRef.current = board;
          setStatus("error");
          notify(
            "Could not save in this browser. Export your lesson to keep a copy.",
          );
          throw new Error("The lesson could not be saved.");
        }
      });
    return saveQueue.current;
  }, [notify]);

  useEffect(() => {
    let cancelled = false;
    initialize()
      .then((items) => {
        if (cancelled) return;
        setBoards(items);
        let lastId: string | null = null;
        try {
          lastId = localStorage.getItem("classboard:active");
        } catch {
          /* IndexedDB still works when preferences are unavailable. */
        }
        const board = items.find((item) => item.id === lastId) ?? items[0];
        fitOnLoad.current = !lastId;
        activeRef.current = board;
        setActive(board);
        setElements(board.elements);
        setReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "This browser could not open local storage. Enable site storage or try a regular browser window.",
          );
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const persist = () => {
      void flush().catch(() => undefined);
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (pendingRef.current) {
        persist();
        event.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", persist);
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", persist);
      window.removeEventListener("beforeunload", beforeUnload);
      persist();
    };
  }, [flush]);

  function enterBoard(board: Board, shouldFit = false) {
    lastSignature.current = "";
    fitOnLoad.current = shouldFit;
    activeRef.current = board;
    setApi(null);
    setActive(board);
    setElements(board.elements);
    setGrid(!!board.appState.gridModeEnabled);
    setStatus("saved");
    try {
      localStorage.setItem("classboard:active", board.id);
    } catch {
      /* The board itself is stored in IndexedDB. */
    }
    if (window.innerWidth < 900) setSidebar(false);
  }

  async function switchBoard(board: Board) {
    if (board.id === activeRef.current?.id) return;
    if (roomBusy) {
      setModal("share");
      notify("End or leave the live lesson before switching boards.");
      return;
    }
    try {
      await flush();
      enterBoard(board);
    } catch {
      /* Keep the unsaved board open. */
    }
  }

  async function newBoard(template?: "brainstorm") {
    if (roomBusy) {
      setModal("share");
      notify("End or leave the live lesson before creating another board.");
      return;
    }
    try {
      await flush();
      const board = createBoard(
        template === "brainstorm" ? "Class brainstorm" : "Untitled lesson",
        template,
      );
      await saveBoard(board);
      setBoards((previous) => [board, ...previous]);
      enterBoard(board, !!template);
    } catch {
      notify("Could not create a board. Check your browser storage.");
    }
  }

  const onChange = useCallback(
    (
      nextElements: readonly ExcalidrawElement[],
      state: AppState,
      files: BinaryFiles,
    ) => {
      const current = activeRef.current;
      if (!current) return;
      roomRef.current?.change(nextElements, files);
      setElements(nextElements);
      setViewport((previous) =>
        previous.scrollX === state.scrollX &&
        previous.scrollY === state.scrollY &&
        previous.zoom.value === state.zoom.value &&
        previous.width === state.width &&
        previous.height === state.height
          ? previous
          : {
              scrollX: state.scrollX,
              scrollY: state.scrollY,
              zoom: state.zoom,
              width: state.width,
              height: state.height,
            },
      );
      setGrid(state.gridModeEnabled);
      const signature = `${nextElements.map((element) => `${element.id}:${element.version}:${element.versionNonce}`).join("|")}/${state.scrollX}/${state.scrollY}/${state.zoom.value}/${state.gridSize}/${state.gridModeEnabled}/${state.viewBackgroundColor}/${Object.keys(files).join(",")}`;
      if (signature === lastSignature.current) return;
      lastSignature.current = signature;
      const board = {
        ...current,
        elements: nextElements,
        appState: savedState(state),
        files,
        updatedAt: Date.now(),
      };
      activeRef.current = board;
      pendingRef.current = board;
      setStatus("saving");
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void flush().catch(() => undefined);
      }, 400);
    },
    [flush],
  );

  function receiveApi(next: ExcalidrawImperativeAPI) {
    setApi(next);
  }

  useEffect(() => {
    if (!api) return;
    // Refresh after the editor's ResizeObserver has updated its tool breakpoints.
    const frame = requestAnimationFrame(() => api.refresh());
    return () => cancelAnimationFrame(frame);
  }, [api, viewport.width, viewport.height]);

  useEffect(() => {
    if (!api) return;
    if (fitOnLoad.current) {
      const frame = requestAnimationFrame(() => {
        api.scrollToContent(undefined, { fitToContent: true });
        fitOnLoad.current = false;
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [api]);

  async function rename(event: React.FormEvent) {
    event.preventDefault();
    if (!activeRef.current || !name.trim()) return;
    const board = {
      ...activeRef.current,
      name: name.trim(),
      updatedAt: Date.now(),
    };
    activeRef.current = board;
    setActive(board);
    pendingRef.current = board;
    try {
      await flush();
      setModal(null);
    } catch {
      /* Retain the editable name. */
    }
  }

  async function duplicate() {
    if (roomBusy) {
      setModal("share");
      notify("End or leave the live lesson before duplicating this board.");
      return;
    }
    if (!activeRef.current) return;
    try {
      await flush();
      const board = {
        ...activeRef.current,
        id: crypto.randomUUID(),
        name: `${activeRef.current.name} (copy)`,
        updatedAt: Date.now(),
      };
      await saveBoard(board);
      setBoards((previous) => [board, ...previous]);
      enterBoard(board);
      notify("Lesson duplicated");
    } catch {
      notify("Could not duplicate this lesson.");
    }
  }

  async function deleteActive() {
    if (roomBusy) {
      setModal("share");
      notify("End or leave the live lesson before deleting this board.");
      return;
    }
    if (!activeRef.current) return;
    try {
      await flush();
      const id = activeRef.current.id;
      let remaining = boards.filter((board) => board.id !== id);
      if (!remaining.length) {
        const blank = createBoard();
        await saveBoard(blank);
        remaining = [blank];
      }
      await removeBoard(id);
      setBoards(remaining);
      enterBoard(remaining[0]);
      setModal(null);
      notify("Lesson deleted from this browser");
    } catch {
      notify("Could not delete this lesson.");
    }
  }

  async function exportBoard(format: "json" | "png" | "svg") {
    if (!api || !activeRef.current) return;
    setExporting(true);
    try {
      const scene = api.getSceneElements();
      const state = api.getAppState();
      const files = api.getFiles();
      const filename = activeRef.current.name.replace(/[<>:"/\\|?*]/g, "-");
      if (format === "json")
        setDownloadInfo(
          download(
            new Blob([serializeAsJSON(scene, state, files, "local")], {
              type: "application/json",
            }),
            `${filename}.excalidraw`,
          ),
        );
      else {
        if (!scene.length) {
          notify("Add something to the board before exporting an image.");
          return;
        }
        const options = {
          elements: scene,
          appState: {
            ...state,
            exportBackground: true,
            exportWithDarkMode: false,
          },
          files,
          exportPadding: 32,
        };
        if (format === "png")
          setDownloadInfo(
            download(
              await exportToBlob({
                ...options,
                mimeType: "image/png",
                maxWidthOrHeight: 6000,
              }),
              `${filename}.png`,
            ),
          );
        else {
          const svg = await exportToSvg(options);
          setDownloadInfo(
            download(
              new Blob([svg.outerHTML], { type: "image/svg+xml" }),
              `${filename}.svg`,
            ),
          );
        }
      }
    } catch {
      notify("Export failed. Try the editable board file for a large lesson.");
    } finally {
      setExporting(false);
    }
  }

  async function importBoard(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (roomBusy) {
      setModal("share");
      notify("End or leave the live lesson before importing another board.");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      notify("Please choose a board smaller than 50 MB.");
      return;
    }
    try {
      const imported = await loadFromBlob(file, null, null);
      await flush();
      const board: Board = {
        ...createBoard(file.name.replace(/\.(excalidraw|json|png|svg)$/i, "")),
        elements: imported.elements,
        files: imported.files ?? {},
        appState: {
          ...defaults,
          viewBackgroundColor: imported.appState.viewBackgroundColor,
          gridSize: imported.appState.gridSize,
          gridModeEnabled: imported.appState.gridModeEnabled,
        },
      };
      await saveBoard(board);
      setBoards((previous) => [board, ...previous]);
      enterBoard(board, true);
      notify("Lesson imported");
    } catch {
      notify(
        "This file could not be opened. Choose an .excalidraw board or an image with embedded board data.",
      );
    }
  }

  function addSticky() {
    if (!api || (roomBusy && !room.isHost && !room.canDraw)) return;
    const state = api.getAppState();
    const x = -state.scrollX + state.width / state.zoom.value / 2 - 100;
    const y = -state.scrollY + state.height / state.zoom.value / 2 - 80;
    const additions = convertToExcalidrawElements([
      {
        type: "rectangle",
        x,
        y,
        width: 220,
        height: 160,
        backgroundColor: "#fff2cd",
        fillStyle: "solid",
        strokeColor: "#e4ce87",
        roughness: 0,
        label: { text: "New idea", fontSize: 22, fontFamily: 2 },
      },
    ]);
    api.updateScene({
      elements: [...api.getSceneElementsIncludingDeleted(), ...additions],
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      appState: {
        selectedElementIds: Object.fromEntries(
          additions.map((element) => [element.id, true]),
        ),
      },
    });
    api.setActiveTool({ type: "selection" });
  }

  function fitAll() {
    if (!api) return;
    if (api.getSceneElements().length)
      api.scrollToContent(undefined, { fitToContent: true, animate: true });
    else
      api.updateScene({
        appState: {
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 as AppState["zoom"]["value"] },
        },
      });
  }

  async function fullscreen() {
    if (canvasFullscreen || document.fullscreenElement) {
      setCanvasFullscreen(false);
      if (document.fullscreenElement)
        await document.exitFullscreen().catch(() => undefined);
      return;
    }
    setCanvasFullscreen(true);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      /* Embedded browsers still get the expanded, canvas-only layout. */
    }
  }

  function startLive(name: string, invite?: { host: string; token: string }) {
    roomRef.current?.destroy();
    const connection = new LiveRoom({
      getApi: () => apiRef.current,
      getTitle: () => activeRef.current?.name ?? "Live lesson",
      onState: setRoom,
      onTitle: (title) => {
        if (!activeRef.current) return;
        const board = { ...activeRef.current, name: title };
        activeRef.current = board;
        pendingRef.current = board;
        setActive(board);
        void flush().catch(() => undefined);
      },
    });
    roomRef.current = connection;
    void connection.start(name, invite);
  }

  useEffect(() => {
    if (!pendingJoin || !api || active?.id !== pendingJoin.id) return;
    startLive(pendingJoin.name, pendingJoin.invite);
    setPendingJoin(null);
  }, [pendingJoin, api, active?.id]);

  async function submitRoom(event: React.FormEvent) {
    event.preventDefault();
    if (!displayName.trim() || !api || roomBusy || pendingJoin) return;
    if (joinMode) {
      const invite = parseInvite(inviteLink);
      if (!invite) {
        notify("Please enter a complete Classboard room link.");
        return;
      }
      try {
        await flush();
        const board = createBoard("Live lesson");
        await saveBoard(board);
        setBoards((previous) => [board, ...previous]);
        enterBoard(board);
        setPendingJoin({ id: board.id, name: displayName, invite });
      } catch {
        notify("Could not save your current lesson. Export it before joining.");
      }
    } else startLive(displayName);
  }

  function endLive() {
    roomRef.current?.destroy();
    roomRef.current = null;
    if (parseInvite(location.href))
      history.replaceState(null, "", location.pathname + location.search);
    setModal(null);
    notify("Live session closed. Your lesson stays on this device.");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(room.link);
      notify("Invitation link copied");
    } catch {
      notify("Select the invitation link and copy it from the field.");
    }
  }

  if (!ready)
    return (
      <div className="loading-screen">
        <Presentation size={34} />
        <span>Opening your workspace</span>
        <LoaderCircle size={20} className="spin" />
      </div>
    );
  if (error || !active)
    return (
      <div className="loading-screen">
        <HardDrive size={34} />
        <h1>Unable to open your lessons</h1>
        <p>{error}</p>
        <button
          className="primary-button"
          onClick={() => {
            initialization = undefined;
            location.reload();
          }}
        >
          Try again
        </button>
      </div>
    );

  const objectCount = elements.filter((element) => !element.isDeleted).length;
  return (
    <div
      className={`app ${presenting ? "presenting" : ""} ${canvasFullscreen ? "canvas-fullscreen" : ""}`}
    >
      <header className="app-header">
        <div className="brand">
          <div className="brand-mark">
            <Presentation size={23} strokeWidth={1.8} />
          </div>
          <span>
            classboard<span className="brand-period">.</span>
          </span>
        </div>
        <div className="header-divider" />
        <div className="lesson-heading">
          <button
            className="lesson-title"
            onClick={() => {
              setName(active.name);
              setModal("rename");
            }}
            title="Rename lesson"
          >
            {active.name}
            <SquarePen size={14} />
          </button>
          <span className={`save-status ${status}`} aria-live="polite">
            {status === "saved" ? (
              <Check size={12} />
            ) : status === "saving" ? (
              <LoaderCircle className="spin" size={12} />
            ) : (
              <HardDrive size={12} />
            )}
            {status === "saved"
              ? "Saved on this device"
              : status === "saving"
                ? "Saving..."
                : "Not saved - export a copy"}
          </span>
        </div>
        <div className="header-actions">
          <button
            className={`text-button present-button ${presenting ? "selected" : ""}`}
            aria-label={presenting ? "Exit presentation" : "Present"}
            title={presenting ? "Exit presentation" : "Present"}
            onClick={() => setPresenting(!presenting)}
          >
            {presenting ? <ArrowLeft size={17} /> : <Presentation size={17} />}
            <span>{presenting ? "Exit presentation" : "Present"}</span>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className="text-button export-button"
              aria-label="Export"
              title="Export lesson"
              disabled={exporting}
            >
              {exporting ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <ArrowDownToLine size={17} />
              )}
              <span>Export</span>
              <ChevronDown size={13} />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="dropdown"
                align="end"
                sideOffset={8}
              >
                <DropdownMenu.Label className="menu-label">
                  EXPORT LESSON
                </DropdownMenu.Label>
                <MenuItem
                  onSelect={() => {
                    void exportBoard("json");
                  }}
                >
                  <FileJson size={17} />
                  Editable board<span>.excalidraw</span>
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    void exportBoard("png");
                  }}
                >
                  <FileImage size={17} />
                  PNG image
                </MenuItem>
                <MenuItem
                  onSelect={() => {
                    void exportBoard("svg");
                  }}
                >
                  <Shapes size={17} />
                  SVG image
                </MenuItem>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
          <button
            className="primary-button share-button"
            aria-label={roomBusy ? "Live lesson" : "Share lesson"}
            onClick={() => setModal("share")}
          >
            <Users size={17} />
            <span>
              {roomBusy
                ? `Live (${Math.max(1, room.participants.length)})`
                : "Share lesson"}
            </span>
          </button>
        </div>
      </header>

      <div className="workspace">
        {sidebar && !presenting && (
          <aside className="lesson-sidebar">
            <div className="sidebar-heading">
              <span>WORKSPACE</span>
              <button
                className="icon-button small"
                title="Hide lessons"
                aria-label="Hide lessons"
                onClick={() => setSidebar(false)}
              >
                <PanelLeft size={17} />
              </button>
            </div>
            <button
              className="new-board"
              onClick={() => {
                void newBoard();
              }}
            >
              <Plus size={17} />
              New lesson
            </button>
            <div className="section-label">
              <span>Your lessons</span>
              <span className="count">{boards.length}</span>
            </div>
            <nav className="board-list" aria-label="Saved lessons">
              {boards.map((board) => (
                <button
                  key={board.id}
                  className={`board-item ${active.id === board.id ? "current" : ""}`}
                  onClick={() => {
                    void switchBoard(board);
                  }}
                >
                  <BookOpen size={17} />
                  <span>
                    <strong>{board.name}</strong>
                    <small>
                      {board.elements.filter((element) => !element.isDeleted)
                        .length === 0
                        ? "Blank canvas"
                        : `${board.elements.filter((element) => !element.isDeleted).length} objects`}
                    </small>
                  </span>
                  {active.id === board.id && <span className="current-dot" />}
                </button>
              ))}
            </nav>
            <div className="sidebar-bottom">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger className="sidebar-action">
                  <LayoutTemplate size={18} />
                  Lesson templates
                  <ChevronDown size={14} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="dropdown"
                    side="right"
                    align="end"
                    sideOffset={10}
                  >
                    <DropdownMenu.Label className="menu-label">
                      START WITH A TEMPLATE
                    </DropdownMenu.Label>
                    <MenuItem
                      onSelect={() => {
                        void newBoard("brainstorm");
                      }}
                    >
                      <StickyNote size={17} />
                      Class brainstorm
                    </MenuItem>
                    <MenuItem
                      onSelect={() => {
                        void newBoard();
                      }}
                    >
                      <FilePlus2 size={17} />
                      Blank canvas
                    </MenuItem>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button
                className="sidebar-action"
                onClick={() => input.current?.click()}
              >
                <Upload size={18} />
                Import lesson
              </button>
              <button
                className="sidebar-action"
                onClick={() => setModal("help")}
              >
                <CircleHelp size={18} />
                Help & shortcuts
              </button>
              <div className="local-label">
                <HardDrive size={14} />
                <span>Local workspace</span>
              </div>
            </div>
          </aside>
        )}
        {sidebar && !presenting && (
          <button
            className="sidebar-scrim"
            aria-label="Close lessons"
            onClick={() => setSidebar(false)}
          />
        )}
        <main className="board-area">
          <div className="canvas-topbar">
            <div className="canvas-topbar-left">
              {(!sidebar || presenting) && (
                <button
                  className="icon-button"
                  title="Show lessons"
                  aria-label="Show lessons"
                  onClick={() => {
                    setPresenting(false);
                    setSidebar(true);
                  }}
                >
                  <PanelLeft size={18} />
                </button>
              )}
              <span className="board-label">
                <span className="live-dot" />
                {room.phase === "connecting"
                  ? "Connecting..."
                  : room.phase === "joined" && !room.canDraw
                    ? "View only"
                    : roomBusy
                      ? "Live classroom"
                      : presenting
                        ? "Presentation"
                        : "Whiteboard"}
              </span>
              <span className="canvas-infinite">Infinite canvas</span>
              {room.error && (
                <button
                  className="room-warning"
                  onClick={() => setModal("share")}
                >
                  Connection notice
                </button>
              )}
            </div>
            <div className="canvas-topbar-actions">
              <button
                className="icon-button"
                title="Add sticky note"
                aria-label="Add sticky note"
                onClick={addSticky}
              >
                <StickyNote size={17} />
              </button>
              <button
                className={`icon-button ${grid ? "active" : ""}`}
                title="Toggle grid"
                aria-label="Toggle grid"
                aria-pressed={grid}
                onClick={() =>
                  api?.updateScene({ appState: { gridModeEnabled: !grid } })
                }
              >
                <Grid2X2 size={17} />
              </button>
              <button
                className="fit-button"
                onClick={fitAll}
                title="Fit all content (Shift+1)"
              >
                <Scan size={17} />
                <span>Fit all</span>
              </button>
              <button
                className={`fit-button fullscreen-button ${canvasFullscreen ? "active" : ""}`}
                aria-label={
                  canvasFullscreen ? "Exit fullscreen" : "Enter fullscreen"
                }
                title={
                  canvasFullscreen
                    ? "Exit fullscreen (Esc)"
                    : "Use the whole screen"
                }
                onClick={() => {
                  void fullscreen();
                }}
              >
                {canvasFullscreen ? (
                  <Minimize size={17} />
                ) : (
                  <Fullscreen size={17} />
                )}
                <span>
                  {canvasFullscreen ? "Exit fullscreen" : "Fullscreen"}
                </span>
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className="icon-button"
                  aria-label="Board options"
                  title="Board options"
                >
                  <MoreHorizontal size={19} />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="dropdown"
                    align="end"
                    sideOffset={8}
                  >
                    <MenuItem
                      onSelect={() => {
                        setName(active.name);
                        setModal("rename");
                      }}
                    >
                      <SquarePen size={17} />
                      Rename lesson
                    </MenuItem>
                    <MenuItem
                      onSelect={() => {
                        void duplicate();
                      }}
                    >
                      <Copy size={17} />
                      Duplicate lesson
                    </MenuItem>
                    <MenuItem onSelect={() => input.current?.click()}>
                      <FolderOpen size={17} />
                      Import lesson
                    </MenuItem>
                    <DropdownMenu.Separator className="menu-separator" />
                    <MenuItem danger onSelect={() => setModal("delete")}>
                      <Trash2 size={17} />
                      Delete lesson
                    </MenuItem>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
          </div>
          <div className="canvas-container">
            <Excalidraw
              key={active.id}
              excalidrawAPI={receiveApi}
              initialData={{
                elements: active.elements,
                appState: { ...defaults, ...active.appState },
                files: active.files,
              }}
              onChange={onChange}
              isCollaborating={
                room.phase === "hosting" || room.phase === "joined"
              }
              viewModeEnabled={
                roomBusy &&
                !room.isHost &&
                (room.phase === "connecting" || !room.canDraw)
              }
              onPointerUpdate={(payload) => roomRef.current?.pointer(payload)}
              name={active.name}
              theme="light"
              zenModeEnabled={presenting}
              autoFocus={false}
              UIOptions={{
                canvasActions: {
                  saveToActiveFile: false,
                  loadScene: false,
                  export: false,
                  toggleTheme: false,
                },
                tools: { image: true },
              }}
            >
              <MainMenu>
                <MainMenu.DefaultItems.ClearCanvas />
                <MainMenu.DefaultItems.ChangeCanvasBackground />
                <MainMenu.DefaultItems.Help />
              </MainMenu>
            </Excalidraw>
            {api && (
              <Minimap
                api={api}
                elements={elements}
                viewport={viewport}
                expanded={overview && !presenting}
                onToggle={() => setOverview(!overview)}
                onFit={fitAll}
              />
            )}
            {room.stream && (
              <ScreenPreview
                stream={room.stream}
                isHost={room.isHost}
                onStop={() => roomRef.current?.stopScreen()}
              />
            )}
          </div>
          <footer className="canvas-footer">
            <span>
              <span className="footer-mark" />
              {objectCount} {objectCount === 1 ? "object" : "objects"}
            </span>
            <span className="footer-center">
              {presenting ? "Presentation view" : active.name}
            </span>
            <button
              onClick={() => setModal("help")}
              aria-label="Open help"
              title="Open help"
            >
              <CircleHelp size={14} />
            </button>
          </footer>
        </main>
      </div>
      <input
        ref={input}
        type="file"
        accept=".excalidraw,.json,.png,.svg"
        className="sr-only"
        onChange={(event) => {
          void importBoard(event);
        }}
      />
      {downloadInfo && (
        <div className="export-ready" role="status">
          <FileJson size={17} />
          <span>Export ready</span>
          <a href={downloadInfo.url} download={downloadInfo.filename}>
            Download {downloadInfo.filename}
          </a>
          <button
            className="icon-button small"
            aria-label="Dismiss export"
            onClick={() => setDownloadInfo(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button small"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <Modal
        open={modal === "rename"}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Rename lesson"
      >
        <form
          onSubmit={(event) => {
            void rename(event);
          }}
        >
          <label className="field-label" htmlFor="lesson-name">
            Lesson name
          </label>
          <input
            id="lesson-name"
            className="text-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            autoFocus
            required
          />
          <div className="modal-actions">
            <button
              type="button"
              className="text-button"
              onClick={() => setModal(null)}
            >
              Cancel
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={!name.trim()}
            >
              Save name
            </button>
          </div>
        </form>
      </Modal>
      <Modal
        open={modal === "delete"}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Delete this lesson?"
        description={`\u201c${active.name}\u201d will be removed from this browser. Export a copy first to keep your work.`}
      >
        <div className="modal-actions">
          <button className="text-button" onClick={() => setModal(null)}>
            Cancel
          </button>
          <button
            className="danger-button"
            onClick={() => {
              void deleteActive();
            }}
          >
            Delete lesson
          </button>
        </div>
      </Modal>
      <Modal
        open={modal === "share"}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title={roomBusy ? "Your live classroom" : "Share your lesson"}
        description={
          roomBusy
            ? "Keep the teacher's tab open for the duration of the lesson."
            : "Invite your students to draw together, or send them a copy of your lesson."
        }
      >
        {room.error && (
          <p className="connection-error" role="alert">
            {room.error}
          </p>
        )}
        {room.phase === "connecting" ? (
          <div className="room-connecting">
            <LoaderCircle className="spin" size={26} />
            <span>Connecting to the classroom...</span>
            <button className="text-button" onClick={endLive}>
              Cancel
            </button>
          </div>
        ) : roomBusy ? (
          <div className="room-details">
            {room.isHost && (
              <>
                <label className="field-label" htmlFor="room-link">
                  Invitation link
                </label>
                <div className="copy-field">
                  <input
                    id="room-link"
                    className="text-input"
                    value={room.link}
                    readOnly
                    onFocus={(event) => event.target.select()}
                  />
                  <button
                    className="primary-button"
                    aria-label="Copy invitation link"
                    onClick={() => {
                      void copyLink();
                    }}
                  >
                    <Copy size={17} />
                  </button>
                </div>
                <p className="small-note">
                  Anyone with this link can join. Share it with your class only.
                </p>
              </>
            )}
            <div className="participants">
              <span className="field-label">
                In this classroom ({room.participants.length})
              </span>
              {room.participants.map((person, index) => (
                <div key={person.id} className="participant">
                  <span className="avatar">
                    {person.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span>{person.name}</span>
                  {index === 0 && <small>Teacher</small>}
                </div>
              ))}
            </div>
            {room.isHost && (
              <>
                <label className="permission-toggle">
                  <span>Students can draw</span>
                  <input
                    type="checkbox"
                    checked={room.canDraw}
                    onChange={(event) =>
                      roomRef.current?.setCanDraw(event.target.checked)
                    }
                  />
                </label>
                <button
                  className="text-button screen-share-button"
                  onClick={() => {
                    if (room.stream) roomRef.current?.stopScreen();
                    else void roomRef.current?.shareScreen();
                  }}
                >
                  <MonitorUp size={17} />
                  {room.stream ? "Stop sharing screen" : "Share your screen"}
                </button>
              </>
            )}
            <button className="end-room" onClick={endLive}>
              {room.isHost ? "End live lesson" : "Leave classroom"}
            </button>
          </div>
        ) : (
          <form
            onSubmit={(event) => {
              void submitRoom(event);
            }}
            className="room-form"
          >
            <div className="segmented-control">
              <button
                type="button"
                className={!joinMode ? "selected" : ""}
                onClick={() => setJoinMode(false)}
              >
                <Users size={15} />
                Host a lesson
              </button>
              <button
                type="button"
                className={joinMode ? "selected" : ""}
                onClick={() => setJoinMode(true)}
              >
                <Link size={15} />
                Join a lesson
              </button>
            </div>
            <label className="field-label" htmlFor="display-name">
              Your name
            </label>
            <input
              id="display-name"
              className="text-input"
              placeholder={joinMode ? "Student name" : "Teacher name"}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={40}
              required
            />
            {joinMode && (
              <>
                <label
                  className="field-label room-link-label"
                  htmlFor="invite-link"
                >
                  Invitation link
                </label>
                <input
                  id="invite-link"
                  className="text-input"
                  placeholder="Paste the link from your teacher"
                  value={inviteLink}
                  onChange={(event) => setInviteLink(event.target.value)}
                  required
                />
              </>
            )}
            <p className="connection-note">
              Live rooms connect through PeerJS Cloud and Google STUN. No
              account is needed. Some school networks may block connections;
              local drawing and exports still work.
            </p>
            <button
              className="primary-button start-room"
              type="submit"
              disabled={
                !displayName.trim() ||
                (joinMode && !parseInvite(inviteLink)) ||
                !!pendingJoin
              }
            >
              {pendingJoin ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Users size={16} />
              )}
              {joinMode ? "Join lesson" : "Start live lesson"}
            </button>
          </form>
        )}
        <div className="share-divider">SEND A COPY</div>
        <div className="share-options">
          <button
            className="share-option"
            onClick={() => {
              void exportBoard("json");
            }}
          >
            <FileJson size={24} />
            <span>
              <strong>Editable lesson</strong>
              <small>Opens as a separate board.</small>
            </span>
            <ArrowDownToLine size={18} />
          </button>
          <button
            className="share-option"
            onClick={() => {
              void exportBoard("png");
            }}
          >
            <FileImage size={24} />
            <span>
              <strong>Lesson image</strong>
              <small>A snapshot of the entire board.</small>
            </span>
            <ArrowDownToLine size={18} />
          </button>
        </div>
      </Modal>
      <Modal
        open={modal === "help"}
        onOpenChange={(open) => {
          if (!open) setModal(null);
        }}
        title="Make room for every idea"
        description="Your lessons are saved in this browser. Export an editable copy for a backup or to move between devices."
      >
        <div className="shortcut-grid">
          {[
            ["Move around", "Space + drag"],
            ["Zoom", "Ctrl / Cmd + scroll"],
            ["See the whole board", "Shift + 1"],
            ["Pen", "P"],
            ["Text", "T"],
            ["Eraser", "E"],
            ["Undo", "Ctrl / Cmd + Z"],
            ["Redo", "Ctrl / Cmd + Shift + Z"],
          ].map(([label, shortcut]) => (
            <div key={label}>
              <span>{label}</span>
              <kbd>{shortcut}</kbd>
            </div>
          ))}
        </div>
        <p className="help-note">
          On a touch screen, use two fingers to pan and pinch to zoom. To share
          your screen, select this browser window in your video call.
        </p>
        <div className="powered-by">
          <Sparkles size={15} />
          Drawing tools powered by Excalidraw
        </div>
      </Modal>
    </div>
  );
}
