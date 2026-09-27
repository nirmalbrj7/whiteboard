import { get, set, del, keys } from "idb-keyval";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState, BinaryFiles } from "@excalidraw/excalidraw/types";

export type Board = {
  id: string;
  name: string;
  updatedAt: number;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

const prefix = "classboard:board:";
export const defaults: Partial<AppState> = {
  viewBackgroundColor: "#ffffff",
  currentItemStrokeColor: "#263533",
  currentItemFontFamily: 2,
  currentItemRoughness: 0,
  currentItemStrokeWidth: 2,
  gridSize: 20,
  gridModeEnabled: false,
  scrollX: 0,
  scrollY: 0,
  zoom: { value: 1 as AppState["zoom"]["value"] },
};

export function savedState(state: AppState): Partial<AppState> {
  return {
    viewBackgroundColor: state.viewBackgroundColor,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    zoom: state.zoom,
    gridSize: state.gridSize,
    gridModeEnabled: state.gridModeEnabled,
    currentItemStrokeColor: state.currentItemStrokeColor,
    currentItemBackgroundColor: state.currentItemBackgroundColor,
    currentItemFillStyle: state.currentItemFillStyle,
    currentItemStrokeWidth: state.currentItemStrokeWidth,
    currentItemRoughness: state.currentItemRoughness,
    currentItemFontFamily: state.currentItemFontFamily,
  };
}

export function createBoard(
  name = "Untitled lesson",
  template?: "brainstorm",
): Board {
  return {
    id: crypto.randomUUID(),
    name,
    updatedAt: Date.now(),
    elements: template === "brainstorm" ? brainstorm() : [],
    appState: { ...defaults },
    files: {},
  };
}

export async function listBoards(): Promise<Board[]> {
  const boardKeys = (await keys()).filter((key) =>
    String(key).startsWith(prefix),
  );
  const boards = await Promise.all(boardKeys.map((key) => get<Board>(key)));
  return boards
    .filter((board): board is Board => !!board)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export const saveBoard = (board: Board) => set(prefix + board.id, board);
export const removeBoard = (id: string) => del(prefix + id);

const text = (
  x: number,
  y: number,
  value: string,
  fontSize = 22,
  strokeColor = "#263533",
) => ({
  type: "text" as const,
  x,
  y,
  text: value,
  fontSize,
  fontFamily: 2,
  strokeColor,
});
const rect = (
  x: number,
  y: number,
  width: number,
  height: number,
  backgroundColor: string,
  strokeColor = "transparent",
) => ({
  type: "rectangle" as const,
  x,
  y,
  width,
  height,
  backgroundColor,
  strokeColor,
  fillStyle: "solid" as const,
  roughness: 0,
});

function brainstorm() {
  return convertToExcalidrawElements([
    text(80, 60, "Let's explore an idea", 36),
    ...[
      ["What we know", "#e5f2ec"],
      ["What we wonder", "#fff2cd"],
      ["What we learned", "#e6effa"],
    ].flatMap(([label, color], index) => [
      rect(80 + index * 280, 150, 250, 340, color),
      text(100 + index * 280, 174, label, 22),
    ]),
  ]);
}
