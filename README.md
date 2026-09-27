# Classboard

A React whiteboard for online lessons. Built with TypeScript, Vite, Excalidraw, IndexedDB, and PeerJS. There is no application server, database service, login, or secret required to deploy it.

## Run locally

Requires Node.js 22 and npm.

```sh
npm install
npm run dev
```

Open the URL printed by Vite (normally http://127.0.0.1:5173).

## Publish as a static app

```sh
npm run build
```

Publish the **contents of `dist/`** to your static host. The production site must use HTTPS for WebRTC, clipboard access, and screen sharing. A localhost address works for development, but cannot be used by students on other computers.

All assets use relative URLs, so the app works at the domain root or in a subfolder, including GitHub Pages. No route rewrites are required: live invitations use the URL fragment. Fonts are copied locally by `postinstall` and included in the build. Do not deploy `node_modules/` or the source folder in place of `dist/`.

## Teach together

1. Open or create a lesson.
2. Choose **Share lesson**, enter your name, and click **Start live lesson**.
3. Copy the invitation link and send that same link to your students.
4. Students open the link, enter a name, and click **Join lesson**.
5. Everyone can draw, erase, insert images, and edit the same board. Each person can pan and zoom independently. Remote pointers and the laser tool help identify what someone is pointing at.
6. Turn off **Students can draw** to make the session view-only for students. Turn it back on for collaborative work.
7. **Share your screen** sends the browser-selected screen or window to connected students. Screen video is optional and requires browser support and permission. Audio is not included; use your normal video call for speaking.
8. Keep the teacher's tab open. Ending the session or closing/reloading that tab disconnects students. Each participant retains a local copy of the lesson.

### What "no backend" means here

You host only static files. Optional live collaboration uses **PeerJS Cloud** for connection signaling and **Google STUN** for discovering network paths. These services are contacted only after the user starts or joins a room. Board content travels over WebRTC data channels between the teacher and students; the teacher relays changes to the other students. Screen video also travels over WebRTC.

The app does not provide permanent cloud board storage, accounts, permanent room URLs, or unattended rooms. An invitation belongs to the running host tab; starting a new session creates a new invitation. This is session-based collaboration, not Miro's persistent cloud workspace.

Public services have availability and network limitations. There is no TURN relay configured, so restrictive school networks, symmetric NAT, or blocked WebRTC may prevent joining. Test your classroom network before teaching. Supporting those networks reliably requires an appropriate relay service; do not embed private long-lived service credentials in a static app. The UI reports connection failures and leaves local drawing available.

Anyone holding an invitation can join. Room names are display names, not verified identities. A room key is required before the host sends board content. The host accepts up to 24 student connections; practical capacity depends on the teacher's network, device, board size, and whether screen video is shared. Large-class capacity has not been load-tested.

## Whiteboard tools

- A blank first lesson with no preloaded teaching content.
- Infinite canvas, mouse/trackpad pan, touch pinch/zoom, zoom controls and presets, and fit-all.
- Clickable board overview for navigating larger lessons.
- Pen, eraser, text, shapes, arrows, images, frames, selection, grouping, and undo/redo.
- Sticky notes, grid, background colors, presentation view, and fullscreen.
- Multiple local lessons, rename, duplicate, delete, and lesson templates.
- Automatic IndexedDB saves, including inserted images.
- Editable `.excalidraw` exports and PNG/SVG exports.
- Import `.excalidraw` boards and compatible images containing embedded Excalidraw data. Use the image tool or paste/drop an image to insert an ordinary picture.

Choose **Fullscreen** above the board to expand the canvas, and **Exit fullscreen** or Escape to return. If the browser blocks native fullscreen, the app still switches to its canvas-only layout. Click the zoom percentage at the bottom right to select a preset, use the adjacent minus/plus controls, or choose **Fit all** to see every object. On a blank board, Fit all resets the view to 100%.

Lessons are local to the browser/device and site address. Clearing site data removes them. Export `.excalidraw` backups to keep or transfer lessons. Browser storage is not a cloud backup. Opening a room invitation does not transmit your existing local lessons; joining creates a separate local board for that session.

## Checks

```sh
npm test
npm run build
npm run preview
```

Protocol tests cover updates, deleted objects, concurrent version identifiers, malformed messages, image data, and invitation parsing. Manual browser verification includes two live participants, edits in both directions, shared undo, view-only permissions, saving/reload, fullscreen, zoom presets, and resizing between desktop/mobile layouts. Export generation was checked, but saving downloads to disk in the embedded browser was not verified. Physical touchscreen input, actual screen capture, restrictive-network connectivity, and large-class performance require testing on the target devices.

## Main files

- `src/App.tsx`: workspace, drawing integration, lesson management, import/export, and room UI.
- `src/board.ts`: local storage and lesson templates.
- `src/LiveRoom.ts`: peer connections, scene synchronization, presence, permissions, and screen video.
- `src/live-protocol.ts`: message validation and change detection.
- `src/Minimap.tsx`: overview, navigation, and zoom controls.
- `src/styles.css`: responsive interface styles.

Excalidraw and PeerJS are open source under the MIT license. Their documentation: https://docs.excalidraw.com/ and https://peerjs.com/client/getting-started.
