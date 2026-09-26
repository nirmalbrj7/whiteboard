import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Monitor, Square } from 'lucide-react';

export default function ScreenPreview({ stream, isHost, onStop }: { stream: MediaStream; isHost: boolean; onStop: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const element = video.current;
    if (element) { element.srcObject = stream; void element.play().catch(() => undefined); }
    return () => { if (element) element.srcObject = null; };
  }, [stream]);
  return <div className={`screen-preview ${collapsed ? 'collapsed' : ''}`}><div className="screen-preview-heading"><Monitor size={15} /><span>{isHost ? 'Your shared screen' : 'Teacher\'s screen'}</span>
    {isHost && <button className="icon-button small" aria-label="Stop screen sharing" title="Stop screen sharing" onClick={onStop}><Square size={12} /></button>}
    <button className="icon-button small" title={collapsed ? 'Show screen' : 'Minimize screen'} aria-label={collapsed ? 'Show screen' : 'Minimize screen'} onClick={() => setCollapsed(!collapsed)}>{collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}</button></div>
    <video ref={video} autoPlay playsInline muted controls={!isHost} /></div>;
}
