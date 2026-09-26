import { useMemo } from 'react';
import { getCommonBounds } from '@excalidraw/excalidraw';
import { LocateFixed, Minus, Plus, Scan } from 'lucide-react';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { ExcalidrawImperativeAPI, AppState } from '@excalidraw/excalidraw/types';

type Props = { elements: readonly ExcalidrawElement[]; viewport: Pick<AppState, 'scrollX' | 'scrollY' | 'zoom' | 'width' | 'height'>; api: ExcalidrawImperativeAPI; expanded: boolean; onToggle: () => void };

export default function Minimap({ elements, viewport, api, expanded, onToggle }: Props) {
  const visible = useMemo(() => elements.filter(element => !element.isDeleted), [elements]);
  const { scrollX, scrollY, zoom, width, height } = viewport;
  const bounds = visible.length ? getCommonBounds(visible) : [-400, -300, 400, 300];
  const left = Math.min(bounds[0] - 80, -scrollX);
  const top = Math.min(bounds[1] - 80, -scrollY);
  const right = Math.max(bounds[2] + 80, -scrollX + width / zoom.value);
  const bottom = Math.max(bounds[3] + 80, -scrollY + height / zoom.value);
  const mapWidth = right - left, mapHeight = bottom - top;
  const mapRatio = 230 / 138;
  const viewWidth = Math.max(mapWidth, mapHeight * mapRatio);
  const viewHeight = viewWidth / mapRatio;
  const viewX = left - (viewWidth - mapWidth) / 2;
  const viewY = top - (viewHeight - mapHeight) / 2;

  function pan(event: React.PointerEvent<SVGSVGElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const x = viewX + (event.clientX - box.left) / box.width * viewWidth;
    const y = viewY + (event.clientY - box.top) / box.height * viewHeight;
    api.updateScene({ appState: { scrollX: -x + width / zoom.value / 2, scrollY: -y + height / zoom.value / 2 } });
  }
  function changeZoom(next: number) {
    const value = Math.max(0.1, Math.min(30, next)) as AppState['zoom']['value'];
    api.updateScene({ appState: { zoom: { value },
      scrollX: scrollX + width / 2 * (1 / value - 1 / zoom.value),
      scrollY: scrollY + height / 2 * (1 / value - 1 / zoom.value) } });
  }

  return <div className={`minimap ${expanded ? 'expanded' : ''}`}>
    {expanded && <><div className="minimap-title"><span>Board overview</span><button className="icon-button small" title="Fit all content" aria-label="Fit all content" onClick={() => api.scrollToContent(undefined, { fitToContent: true, animate: true })}><Scan size={15} /></button></div>
      <svg className="minimap-canvas" role="img" aria-label="Board overview. Click to move around the canvas." viewBox={`${viewX} ${viewY} ${viewWidth} ${viewHeight}`}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); pan(event); }} onPointerMove={event => { if (event.buttons === 1) pan(event); }}>
        {visible.map(element => <g key={element.id} transform={`translate(${element.x} ${element.y}) rotate(${element.angle * 180 / Math.PI} ${element.width / 2} ${element.height / 2})`} opacity={element.opacity / 100}>
          {'points' in element ? <polyline points={element.points.map(point => point.join(',')).join(' ')} fill="none" stroke={element.strokeColor} strokeWidth={Math.max(element.strokeWidth, viewWidth / 550)} />
            : element.type === 'ellipse' ? <ellipse cx={element.width / 2} cy={element.height / 2} rx={element.width / 2} ry={element.height / 2} fill={element.backgroundColor} stroke={element.strokeColor} strokeWidth={viewWidth / 600} />
              : element.type === 'text' ? <rect width={element.width} height={element.height} fill={element.strokeColor} opacity="0.35" />
                : <rect width={element.width} height={element.height} fill={element.backgroundColor === 'transparent' ? '#e8eeeb' : element.backgroundColor} stroke={element.strokeColor} strokeWidth={viewWidth / 600} />}
        </g>)}
        <rect x={-scrollX} y={-scrollY} width={width / zoom.value} height={height / zoom.value} fill="#137a6310" stroke="#137a63" strokeWidth={viewWidth / 150} />
      </svg></>}
    <div className="map-controls"><button className="icon-button" aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom(zoom.value / 1.2)}><Minus size={16} /></button>
      <button className="zoom-value" title="Reset zoom to 100%" onClick={() => changeZoom(1)}>{Math.round(zoom.value * 100)}%</button>
      <button className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom(zoom.value * 1.2)}><Plus size={16} /></button>
      <span className="divider" /><button className={`icon-button ${expanded ? 'active' : ''}`} title="Toggle board overview" aria-label="Toggle board overview" aria-pressed={expanded} onClick={onToggle}><LocateFixed size={18} /></button>
    </div>
  </div>;
}
