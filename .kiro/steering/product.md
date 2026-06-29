# Product Overview

SmartRPD is a web application for designing Removable Partial Dentures (RPDs). It provides:

- **3D Jaw Viewer** – Interactive Three.js-based viewer for STL/OFF jaw models with polyline overlays representing RPD components (retainers, rests, major connectors, proximal plates, etc.)
- **2D Annotation** – Canvas-based annotation tools for clinical markup on jaw images
- **Case Management** – Dashboard for creating, listing, sorting, and managing patient cases
- **Polyline Editing** – Draggable control points for adjusting RPD design paths on the 3D model with undo/redo support
- **Artificial Teeth Rendering** – Visualization of prosthetic tooth placements
- **Chat & Notifications** – Real-time communication and notification system for case collaboration
- **Authentication** – Login with OTP verification and auth-guarded routes

The backend API lives at `https://live.api.smartrpdai.com/api/smartrpd`. The frontend is a static SPA served via nginx (Docker) or GitHub Pages.
