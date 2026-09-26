import { get, set, del, keys } from 'idb-keyval';
import { convertToExcalidrawElements } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState, BinaryFiles } from '@excalidraw/excalidraw/types';

export type Board = {
  id: string;
  name: string;
  updatedAt: number;
  elements: readonly ExcalidrawElement[];
  appState: Partial<AppState>;
  files: BinaryFiles;
};

const prefix = 'classboard:board:';
export const defaults: Partial<AppState> = {
  viewBackgroundColor: '#ffffff', currentItemStrokeColor: '#263533',
  currentItemFontFamily: 2, currentItemRoughness: 0, currentItemStrokeWidth: 2,
  gridSize: 20, gridModeEnabled: false, scrollX: 0, scrollY: 0, zoom: { value: 1 as AppState['zoom']['value'] },
};

export function savedState(state: AppState): Partial<AppState> {
  return {
    viewBackgroundColor: state.viewBackgroundColor, scrollX: state.scrollX,
    scrollY: state.scrollY, zoom: state.zoom, gridSize: state.gridSize, gridModeEnabled: state.gridModeEnabled,
    currentItemStrokeColor: state.currentItemStrokeColor,
    currentItemBackgroundColor: state.currentItemBackgroundColor,
    currentItemFillStyle: state.currentItemFillStyle,
    currentItemStrokeWidth: state.currentItemStrokeWidth,
    currentItemRoughness: state.currentItemRoughness,
    currentItemFontFamily: state.currentItemFontFamily,
  };
}

export function createBoard(name = 'Untitled lesson', template?: 'geometry' | 'brainstorm'): Board {
  return { id: crypto.randomUUID(), name, updatedAt: Date.now(),
    elements: template === 'geometry' ? geometryLesson() : template === 'brainstorm' ? brainstorm() : [],
    appState: { ...defaults }, files: {},
  };
}

export async function listBoards(): Promise<Board[]> {
  const boardKeys = (await keys()).filter(key => String(key).startsWith(prefix));
  const boards = await Promise.all(boardKeys.map(key => get<Board>(key)));
  return boards.filter((board): board is Board => !!board).sort((a, b) => b.updatedAt - a.updatedAt);
}

export const saveBoard = (board: Board) => set(prefix + board.id, board);
export const removeBoard = (id: string) => del(prefix + id);

const text = (x: number, y: number, value: string, fontSize = 22, strokeColor = '#263533') =>
  ({ type: 'text' as const, x, y, text: value, fontSize, fontFamily: 2, strokeColor });
const rect = (x: number, y: number, width: number, height: number, backgroundColor: string, strokeColor = 'transparent') =>
  ({ type: 'rectangle' as const, x, y, width, height, backgroundColor, strokeColor, fillStyle: 'solid' as const, roughness: 0 });

function geometryLesson() {
  return convertToExcalidrawElements([
    text(80, 60, 'MATH / GEOMETRY', 15, '#137a63'),
    text(80, 100, 'The Pythagorean theorem', 36),
    text(80, 152, 'Finding the missing side of a right triangle', 19, '#74807c'),
    { type: 'line', x: 90, y: 256, points: [[0, 210], [280, 210], [0, 0], [0, 210]], strokeColor: '#137a63', backgroundColor: '#e8f5f0', fillStyle: 'solid', strokeWidth: 3, roughness: 0 },
    { type: 'line', x: 90, y: 444, points: [[0, 0], [22, 0], [22, 22]], strokeColor: '#137a63', roughness: 0 },
    text(38, 349, 'a = 3', 20, '#137a63'),
    text(188, 482, 'b = 4', 20, '#137a63'),
    text(245, 332, 'c = ?', 24, '#da6e53'),
    rect(490, 237, 365, 292, '#f6f8f7'),
    text(518, 263, 'LET\'S WORK IT OUT', 14, '#74807c'),
    text(518, 306, 'a\u00b2 + b\u00b2 = c\u00b2', 30),
    text(518, 360, '3\u00b2 + 4\u00b2 = 9 + 16 = 25', 20),
    text(518, 400, 'c = \u221a25', 22),
    rect(516, 451, 145, 44, '#dff1e9'),
    text(535, 462, 'c = 5 units', 21, '#137a63'),
    rect(80, 583, 775, 110, '#fff4db'),
    text(105, 605, 'YOUR TURN', 14, '#976e20'),
    text(105, 641, 'If a = 6 and b = 8, what is c?', 23),
  ]);
}

function brainstorm() {
  return convertToExcalidrawElements([
    text(80, 60, 'Let\'s explore an idea', 36),
    ...[['What we know', '#e5f2ec'], ['What we wonder', '#fff2cd'], ['What we learned', '#e6effa']].flatMap(([label, color], index) => [
      rect(80 + index * 280, 150, 250, 340, color), text(100 + index * 280, 174, label, 22),
    ]),
  ]);
}
