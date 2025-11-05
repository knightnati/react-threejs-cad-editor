#  React + Three.js CAD Editor

A browser-based **CAD editor** built using **React** and **plain Three.js** .  
The project demonstrates 3D scene management, primitive shape creation, 2D sketching with extrusion, selection, transformations, and JSON-based import/export.

This was developed as part of a **24-hour CAD Editor assessment**, emphasizing structure, usability, and core CAD principles.

---

##  Features

###  Primitive Shape Creation
- Create 3D primitives: **Box**, **Sphere**, and **Cylinder**.
- Each primitive has **distinct faces and edges** rendered via `THREE.EdgesGeometry`.
- **Raycast selection** supports:
  - Individual **faces**
  - **Edges**
  - Entire **shapes**
- **Visual highlighting** for selected entities.

###  2D Sketching & Extrusion
- Switch to **Sketch Mode** to draw on the **XZ-plane**.
- **Tools:** Rectangle and Circle.
- **Snap-to-grid** precision drawing.
- **Real-time preview** while dragging.
- Extrude sketches into 3D using `THREE.ExtrudeGeometry`.
- Extruded meshes can be selected and transformed like any primitive.

###  Selection & Transformation
- Select **faces, edges, or full shapes** via mouse.
- Transformations:
  - **Move**, **Rotate**, and **Scale** (via controls or keyboard shortcuts).
- Display contextual **entity properties**:
  - Shape → position, rotation, scale
  - Face → normal, area
  - Edge → length
- Smooth highlighting for clear interaction feedback.

###  Import & Export
- Export the entire scene to a `.json` file including:
  - geometry
  - transforms
  - metadata
- Import the `.json` file to fully restore the scene.
- Imported shapes behave the same as newly created ones.

###  UI & Experience
- Simple React-based toolbar.
- Background theme options (including white, gray, and dark modes).
- Undo/Redo functionality.
- Keyboard shortcuts for all major actions.

---

##  Setup & Run

### 1️ Clone or extract the project
```bash
git clone https://github.com/<your-username>/react-threejs-cad-editor.git
cd react-threejs-cad-editor
```

### 2️ Install dependencies
```bash
npm install
```

### 3️ Start local development
```bash
npm start
```
App runs at **http://localhost:3000**

### 4️ Build for production
```bash
npm run build
```
Output will be inside `/build` (or `/dist` if using Vite).

---

##  Keyboard Shortcuts

| Action |                                 | Key |

|----------------------------------|----------------------------------------|

| Move   X/Z/Y                     | W / A / S / D / Q / E |

| Rotate                           | R / F |

| Scale                            | T / G |

| Delete selected                  | Delete |

| Undo / Redo                      | Ctrl + Z / Ctrl + Y |

| Clear selection                  | Esc |


---

##  Deployment
Deployed via Vercel  GitHub Pages.  
Live demo: https://react-threejs-cad-editor.vercel.app/



---

##  Known Limitations

| Limitation|                                                                                   | Description |

|---------------------------------------------------------------------||--------------------------------------------|

| **Grouping**         || Shapes cannot yet be grouped or combined for collective transforms. |

| **Edge-based movement bugs**                                        ||Occasionally, dragging shapes via edge selections can cause inconsistent movement behavior. |

| **Boolean operations (cut/intersect/union)**                        || Overlapping primitives do not merge or cut each other. No solid modeling (CSG) implemented. |

| **Face/Edge metrics**                                               || Displayed values are approximate; CAD-level accuracy not implemented. |

| **Editable sketches**                                               || Once extruded, sketches cannot be re-edited. |

| **Transform gizmos**                                                || No 3D move/rotate gizmo; transformations rely on buttons/shortcuts. |
|undo & redo                                                              || undo and rodo dont consistently work on sketched polygons


---

##  Deliverables

- ✅*Deployed URL** (https://react-threejs-cad-editor.vercel.app/)
- ✅GitHub repository https://github.com/knightnati/react-threejs-cad-editor  








