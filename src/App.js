// App.jsx (Cleaned and Enhanced CAD Editor)
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export default function App() {
  const mountRef = useRef(null);

  // State
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedEntities, setSelectedEntities] = useState([]);
  const [mode, setMode] = useState("select");
  const [sketchPoints, setSketchPoints] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [extrusionHeight, setExtrusionHeight] = useState(1.0);
  const [sceneBackground, setSceneBackground] = useState("#e5e5e8");
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [selectionMode, setSelectionMode] = useState("shape");

  // Three refs
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const raycasterRef = useRef(null);
  const sketchLineRef = useRef(null);
  const objectsRef = useRef([]);
  const groupsRef = useRef([]);
  const edgeHandlesRef = useRef([]);
  const lastPointerPointRef = useRef(null);
  const currentPreviewRef = useRef(null);

  // Constants
  const planeForSketch = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const GRID_SNAP = 0.5;

  // ====== INITIALIZATION ======
  useEffect(() => {
    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(sceneBackground);
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(8, 10, 8);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    mountRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    // Raycaster
    raycasterRef.current = new THREE.Raycaster();

    // Enhanced Lighting
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 15, 10);
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6);
    scene.add(ambientLight);

    // Grid and sketch plane
    const grid = new THREE.GridHelper(30, 30, 0x444444, 0x222222);
    grid.isGridHelper = true;
    scene.add(grid);
    
    const planeGeo = new THREE.PlaneGeometry(25, 25);
    const planeMat = new THREE.MeshBasicMaterial({ 
      color: 0x4444ff, 
      transparent: true, 
      opacity: 0.1, 
      side: THREE.DoubleSide 
    });
    
    const sketchPlane = new THREE.Mesh(planeGeo, planeMat);
    sketchPlane.rotation.x = -Math.PI / 2;
    sketchPlane.position.y = 0.001;
    scene.add(sketchPlane);

    // Sketch line
    const sketchGeom = new THREE.BufferGeometry();
    const sketchLine = new THREE.Line(
      sketchGeom, 
      new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 })
    );
    sketchLine.position.y = 0.01;
    scene.add(sketchLine);
    sketchLineRef.current = sketchLine;

    // Event handlers
    const onPointerDown = (ev) => {
      if (mode === "select") {
        handleSelection(ev);
      } else if (mode === "sketch-rect") {
        ev.preventDefault();
        startRectangle(ev);
      } else if (mode === "sketch-circle") {
        ev.preventDefault();
        startCircle(ev);
      } else if (mode === "sketch-poly") {
        ev.preventDefault();
        if (ev.button === 0) {
          handlePolygonClick(ev);
        }
      }
    };

    const onDoubleClick = (ev) => {
      if (mode === "sketch-poly") {
        ev.preventDefault();
        finishPolygon();
      }
    };

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("dblclick", onDoubleClick);

    // Animation loop
    let mounted = true;
    function animate() {
      if (!mounted) return;
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener("resize", onResize);

    return () => {
      mounted = false;
      window.removeEventListener("resize", onResize);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("dblclick", onDoubleClick);
      
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement);
      }
    };
  }, [mode, sceneBackground]);

  // ====== FIXED GRID LOCK FOR SKETCHING ======
  const pointerToPlane = (event) => {
    if (!rendererRef.current || !cameraRef.current || !raycasterRef.current) return null;
    
    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    const worldPoint = new THREE.Vector3();
    raycasterRef.current.ray.intersectPlane(planeForSketch, worldPoint);
    
    if (!worldPoint) return null;
    
    // Snap to grid - FIXED: No rotation issues
    worldPoint.x = Math.round(worldPoint.x / GRID_SNAP) * GRID_SNAP;
    worldPoint.z = Math.round(worldPoint.z / GRID_SNAP) * GRID_SNAP;
    worldPoint.y = 0;
    
    return worldPoint;
  };

  // ====== HISTORY MANAGEMENT ======
  const saveHistory = () => {
    const sceneState = objectsRef.current.map(obj => ({
      type: obj.userData?.type || 'unknown',
      position: [obj.position.x, obj.position.y, obj.position.z],
      rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
      scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      color: obj.userData.originalColor || 0xffffff,
      userData: { ...obj.userData }
    }));

    // Clean userData for history
    sceneState.forEach(obj => {
      delete obj.userData.originalColor;
      Object.keys(obj.userData).forEach(key => {
        if (typeof obj.userData[key] === 'function' || 
            obj.userData[key] instanceof THREE.Object3D) {
          delete obj.userData[key];
        }
      });
    });

    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(sceneState);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    restoreScene(history[newIndex]);
  };

  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    restoreScene(history[newIndex]);
  };

  const restoreScene = (sceneData) => {
    clearAllObjects();
    
    sceneData.forEach(objData => {
      let geometry;
      switch (objData.type) {
        case 'box':
          geometry = new THREE.BoxGeometry(1, 1, 1);
          break;
        case 'sphere':
          geometry = new THREE.SphereGeometry(0.5, 32, 32);
          break;
        case 'cylinder':
          geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
          break;
        case 'extruded':
          geometry = new THREE.BoxGeometry(1, 1, 1);
          break;
        default:
          geometry = new THREE.BoxGeometry(1, 1, 1);
      }

      const container = createMeshWithEdges(geometry, objData.color);
      container.position.set(...objData.position);
      container.rotation.set(...objData.rotation);
      container.scale.set(...objData.scale);
      container.userData = { 
        ...objData.userData, 
        originalColor: objData.color,
        type: objData.type 
      };

      sceneRef.current.add(container);
      objectsRef.current.push(container);
    });
  };

  // ====== ENHANCED MESH CREATION ======
  const createMeshWithEdges = (geometry, color = Math.random() * 0xffffff) => {
    const material = new THREE.MeshStandardMaterial({
      color: color,
      transparent: true,
      opacity: 0.9,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData.originalColor = color;
    mesh.userData.type = geometry.type.toLowerCase().replace('geometry', '');
    mesh.userData.isSelectable = true;

    // Container group
    const container = new THREE.Group();
    container.add(mesh);
    container.userData.isMainObject = true;
    container.userData.type = mesh.userData.type;
    container.userData.originalColor = color;

    // Wireframe edges
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({ 
      color: 0x000000,
      linewidth: 2
    });
    const wireframe = new THREE.LineSegments(edges, edgeMaterial);
    wireframe.userData.isEdgeVisual = true;
    mesh.add(wireframe);

    return container;
  };

  // ====== ENHANCED SELECTION SYSTEM ======
  const clearAllHighlights = () => {
    objectsRef.current.forEach(container => {
      const mesh = container.children[0];
      if (mesh && mesh.material) {
        if (mesh.material.emissive) {
          mesh.material.emissive.set(0x000000);
        }
        if (container.userData.originalColor) {
          mesh.material.color.setHex(container.userData.originalColor);
        }
        mesh.material.opacity = 0.9;
      }
    });
    
    // Clear edge handles
    edgeHandlesRef.current.forEach(handle => {
      if (handle.parent) {
        handle.parent.remove(handle);
      }
    });
    edgeHandlesRef.current = [];
  };

  const highlightEntity = (entity, selectionType = "shape") => {
    clearAllHighlights();
    
    if (entity && entity.children && entity.children[0]) {
      const mesh = entity.children[0];
      
      switch (selectionType) {
        case "shape":
          if (mesh.material && mesh.material.emissive) {
            mesh.material.emissive.set(0x444400); // Yellow
          }
          break;
        case "face":
          if (mesh.material) {
            mesh.material.emissive.set(0x004444); // Blue
            mesh.material.opacity = 0.7;
          }
          break;
        case "edge":
          if (mesh.material) {
            mesh.material.emissive.set(0x440044); // Purple
            mesh.material.opacity = 0.7;
          }
          createEdgeHandles(entity);
          break;
      }
    }
  };

  // ====== EDGE HANDLES FOR PULLING ======
  const createEdgeHandles = (entity) => {
    const mesh = entity.children[0];
    if (!mesh || !mesh.geometry) return;

    const geometry = mesh.geometry;
    const edges = new THREE.EdgesGeometry(geometry);
    const positions = edges.attributes.position.array;

    for (let i = 0; i < positions.length; i += 6) {
      const start = new THREE.Vector3(positions[i], positions[i+1], positions[i+2]);
      const end = new THREE.Vector3(positions[i+3], positions[i+4], positions[i+5]);
      
      const midPoint = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
      
      const handleGeometry = new THREE.SphereGeometry(0.1, 8, 8);
      const handleMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xff0000,
        transparent: true,
        opacity: 0.8
      });
      
      const handle = new THREE.Mesh(handleGeometry, handleMaterial);
      handle.position.copy(midPoint);
      handle.userData.isEdgeHandle = true;
      handle.userData.parentEntity = entity;
      handle.userData.edgeIndex = i / 6;
      
      mesh.add(handle);
      edgeHandlesRef.current.push(handle);
    }
  };

  // ====== SELECTION HANDLING ======
  const handleSelection = (event) => {
    if (!raycasterRef.current || !cameraRef.current || !rendererRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    
    // Check for edge handles first
    const handleIntersects = raycasterRef.current.intersectObjects(edgeHandlesRef.current, true);
    if (handleIntersects.length > 0) {
      const handle = handleIntersects[0].object;
      startEdgePull(handle);
      return;
    }
    
    // Check main objects
    const intersectableObjects = objectsRef.current.filter(obj => 
      obj !== sketchLineRef.current && !obj.isGridHelper && obj.userData.isMainObject
    );
    
    const intersects = raycasterRef.current.intersectObjects(intersectableObjects, true);
    
    if (intersects.length === 0) {
      setSelectedEntity(null);
      setSelectedEntities([]);
      clearAllHighlights();
      return;
    }

    let selectedObj = intersects[0].object;
    while (selectedObj.parent && !selectedObj.userData.isMainObject) {
      selectedObj = selectedObj.parent;
    }

    setSelectedEntity(selectedObj);
    
    // Determine selection type
    const clickedObject = intersects[0].object;
    let detectedSelectionMode = "shape";
    
    if (clickedObject.userData.isEdgeVisual) {
      detectedSelectionMode = "edge";
    } else if (clickedObject !== selectedObj.children[0]) {
      detectedSelectionMode = "face";
    }
    
    setSelectionMode(detectedSelectionMode);
    highlightEntity(selectedObj, detectedSelectionMode);
  };

  // ====== EDGE PULLING ======
  const startEdgePull = (handle) => {
    if (!handle.userData.parentEntity) return;

    const parentEntity = handle.userData.parentEntity;
    setIsDrawing(true);

    const onMove = (moveEvent) => {
      const p = pointerToPlane(moveEvent);
      if (!p) return;
      
      // Scale transformation based on edge pull
      const scaleFactor = 1 + (p.x * 0.1);
      parentEntity.scale.set(scaleFactor, scaleFactor, scaleFactor);
    };

    const onUp = () => {
      setIsDrawing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      saveHistory();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // ====== GROUPING FUNCTIONALITY ======
  const groupSelected = () => {
    if (selectedEntities.length < 2) return;
    
    const group = new THREE.Group();
    group.userData.isGroup = true;
    group.userData.type = "group";
    
    // Calculate group center
    const center = new THREE.Vector3();
    selectedEntities.forEach(entity => {
      const worldPos = new THREE.Vector3();
      entity.getWorldPosition(worldPos);
      center.add(worldPos);
    });
    center.divideScalar(selectedEntities.length);
    
    group.position.copy(center);
    
    // Reparent entities
    selectedEntities.forEach(entity => {
      const localPos = new THREE.Vector3().copy(entity.position).sub(center);
      entity.position.copy(localPos);
      sceneRef.current.remove(entity);
      group.add(entity);
    });
    
    sceneRef.current.add(group);
    objectsRef.current = objectsRef.current.filter(obj => !selectedEntities.includes(obj));
    objectsRef.current.push(group);
    groupsRef.current.push(group);
    
    setSelectedEntity(group);
    highlightEntity(group);
    saveHistory();
  };

  const ungroupSelected = () => {
    if (!selectedEntity || !selectedEntity.userData.isGroup) return;
    
    const children = [];
    selectedEntity.children.forEach(child => {
      if (child.userData.isMainObject) {
        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        child.position.copy(worldPos);
        sceneRef.current.add(child);
        children.push(child);
      }
    });
    
    sceneRef.current.remove(selectedEntity);
    objectsRef.current = objectsRef.current.filter(obj => obj !== selectedEntity);
    objectsRef.current.push(...children);
    groupsRef.current = groupsRef.current.filter(group => group !== selectedEntity);
    
    setSelectedEntity(null);
    clearAllHighlights();
    saveHistory();
  };

  // ====== MULTI-SELECT ======
  const handleMultiSelect = (event) => {
    if (!event.shiftKey) {
      handleSelection(event);
      return;
    }

    if (!raycasterRef.current || !cameraRef.current || !rendererRef.current) return;

    const rect = rendererRef.current.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    
    const intersectableObjects = objectsRef.current.filter(obj => 
      obj !== sketchLineRef.current && !obj.isGridHelper && obj.userData.isMainObject
    );
    
    const intersects = raycasterRef.current.intersectObjects(intersectableObjects, true);
    
    if (intersects.length === 0) return;

    let selectedObj = intersects[0].object;
    while (selectedObj.parent && !selectedObj.userData.isMainObject) {
      selectedObj = selectedObj.parent;
    }

    if (selectedEntities.includes(selectedObj)) {
      setSelectedEntities(prev => prev.filter(entity => entity !== selectedObj));
      if (selectedEntity === selectedObj) {
        setSelectedEntity(selectedEntities.length > 1 ? selectedEntities[1] : null);
      }
    } else {
      setSelectedEntities(prev => [...prev, selectedObj]);
      setSelectedEntity(selectedObj);
    }

    clearAllHighlights();
    selectedEntities.forEach(entity => highlightEntity(entity, selectionMode));
    if (selectedObj) highlightEntity(selectedObj, selectionMode);
  };

  // ====== OBJECT MANAGEMENT ======
  const addShape = (type, position = null) => {
    if (!sceneRef.current) return null;
    
    let geometry;
    switch (type) {
      case "box":
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
      case "sphere":
        geometry = new THREE.SphereGeometry(0.5, 32, 32);
        break;
      case "cylinder":
        geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        break;
      default:
        geometry = new THREE.BoxGeometry(1, 1, 1);
    }

    const container = createMeshWithEdges(geometry);
    container.position.copy(position || new THREE.Vector3(0, 0.5, 0));

    sceneRef.current.add(container);
    objectsRef.current.push(container);
    saveHistory();
    return container;
  };

  const deleteSelected = () => {
    if (!selectedEntity || !sceneRef.current) return;
    
    if (selectedEntity.userData.isGroup) {
      selectedEntity.children.forEach(child => {
        if (child.userData.isMainObject) {
          sceneRef.current.remove(child);
          objectsRef.current = objectsRef.current.filter(obj => obj !== child);
        }
      });
    }
    
    sceneRef.current.remove(selectedEntity);
    objectsRef.current = objectsRef.current.filter(obj => obj !== selectedEntity);
    setSelectedEntity(null);
    setSelectedEntities([]);
    saveHistory();
  };

  const clearAllObjects = () => {
    if (!sceneRef.current) return;
    
    objectsRef.current.forEach(obj => {
      if (obj.children && obj.children[0]) {
        const mesh = obj.children[0];
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => material.dispose());
          } else {
            mesh.material.dispose();
          }
        }
      }
      sceneRef.current.remove(obj);
    });
    
    objectsRef.current = [];
    groupsRef.current = [];
    setSelectedEntity(null);
    setSelectedEntities([]);
  };

  // ====== TRANSFORMATIONS ======
  const transformSelected = (transformation) => {
    if (!selectedEntity) return;

    const entitiesToTransform = selectedEntities.length > 0 ? selectedEntities : [selectedEntity];
    
    entitiesToTransform.forEach(entity => {
      switch (transformation.type) {
        case "translate":
          entity.position.add(transformation.vector);
          break;
        case "rotate":
          entity.rotation[transformation.axis] += transformation.angle;
          break;
        case "scale":
          entity.scale.multiply(transformation.vector);
          break;
        default:
          break;
      }
    });
    
    saveHistory();
  };

  // ====== ENHANCED PROPERTIES ======
  const getEntityProperties = () => {
    if (!selectedEntity) return null;
    
    const baseProps = {
      Type: selectedEntity.userData?.type ? selectedEntity.userData.type.toUpperCase() : "Unknown",
      Position: `${selectedEntity.position.x.toFixed(3)}, ${selectedEntity.position.y.toFixed(3)}, ${selectedEntity.position.z.toFixed(3)}`,
      Rotation: `${(selectedEntity.rotation.x * 180/Math.PI).toFixed(1)}°, ${(selectedEntity.rotation.y * 180/Math.PI).toFixed(1)}°, ${(selectedEntity.rotation.z * 180/Math.PI).toFixed(1)}°`,
      Scale: `${selectedEntity.scale.x.toFixed(3)}, ${selectedEntity.scale.y.toFixed(3)}, ${selectedEntity.scale.z.toFixed(3)}`,
    };

    // Enhanced geometric properties
    if (selectedEntity.userData.type === 'box') {
      baseProps.Volume = `${(selectedEntity.scale.x * selectedEntity.scale.y * selectedEntity.scale.z).toFixed(3)} m³`;
      baseProps["Surface Area"] = `${(2 * (selectedEntity.scale.x * selectedEntity.scale.y + selectedEntity.scale.x * selectedEntity.scale.z + selectedEntity.scale.y * selectedEntity.scale.z)).toFixed(3)} m²`;
    } else if (selectedEntity.userData.type === 'sphere') {
      const radius = 0.5 * selectedEntity.scale.x;
      baseProps.Volume = `${((4/3) * Math.PI * Math.pow(radius, 3)).toFixed(3)} m³`;
      baseProps["Surface Area"] = `${(4 * Math.PI * Math.pow(radius, 2)).toFixed(3)} m²`;
      baseProps.Radius = `${radius.toFixed(3)} m`;
    } else if (selectedEntity.userData.type === 'cylinder') {
      const radius = 0.5 * selectedEntity.scale.x;
      const height = 1 * selectedEntity.scale.y;
      baseProps.Volume = `${(Math.PI * Math.pow(radius, 2) * height).toFixed(3)} m³`;
      baseProps["Surface Area"] = `${(2 * Math.PI * radius * (radius + height)).toFixed(3)} m²`;
    }

    if (selectedEntity.userData.isGroup) {
      baseProps["Group Size"] = `${selectedEntity.children.length} objects`;
    }

    return baseProps;
  };

  // ====== SKETCHING FUNCTIONS (from working file) ======
  const clearSketch = () => {
    setSketchPoints([]);
    updateSketchLine([]);
    
    if (currentPreviewRef.current) {
      sceneRef.current.remove(currentPreviewRef.current);
      currentPreviewRef.current.geometry?.dispose();
      currentPreviewRef.current = null;
    }
  };

  const finishPolygon = () => {
    if (sketchPoints.length < 3) {
      alert("Need at least 3 points to create a polygon");
      return;
    }
    
    const first = sketchPoints[0];
    const last = sketchPoints[sketchPoints.length - 1];
    
    if (first.distanceTo(last) > 0.1) {
      const closed = [...sketchPoints, first.clone()];
      setSketchPoints(closed);
      updateSketchLine(closed);
    }
  };

  const startRectangle = (startEvent) => {
    const startPoint = pointerToPlane(startEvent);
    if (!startPoint) return;
    
    setIsDrawing(true);
    lastPointerPointRef.current = startPoint.clone();

    if (currentPreviewRef.current) {
      sceneRef.current.remove(currentPreviewRef.current);
      currentPreviewRef.current.geometry?.dispose();
      currentPreviewRef.current = null;
    }

    const previewGeom = new THREE.PlaneGeometry(1, 1);
    const previewMat = new THREE.MeshBasicMaterial({
      color: 0x00ff00,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    
    const preview = new THREE.Mesh(previewGeom, previewMat);
    preview.rotation.x = -Math.PI / 2;
    preview.position.y = 0.05;
    sceneRef.current.add(preview);
    currentPreviewRef.current = preview;

    const onMove = (moveEvent) => {
      const p = pointerToPlane(moveEvent);
      if (!p) return;
      
      lastPointerPointRef.current = p.clone();
      const width = Math.abs(p.x - startPoint.x);
      const height = Math.abs(p.z - startPoint.z);
      const centerX = (p.x + startPoint.x) / 2;
      const centerZ = (p.z + startPoint.z) / 2;

      preview.scale.set(Math.max(width, 0.001), Math.max(height, 0.001), 1);
      preview.position.set(centerX, 0.05, centerZ);

      const previewPoints = [
        new THREE.Vector3(startPoint.x, 0, startPoint.z),
        new THREE.Vector3(p.x, 0, startPoint.z),
        new THREE.Vector3(p.x, 0, p.z),
        new THREE.Vector3(startPoint.x, 0, p.z),
        new THREE.Vector3(startPoint.x, 0, startPoint.z)
      ];
      updateSketchLine(previewPoints);
    };

    const onUp = () => {
      setIsDrawing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const endPoint = lastPointerPointRef.current || startPoint;
      
      if (currentPreviewRef.current) {
        sceneRef.current.remove(currentPreviewRef.current);
        currentPreviewRef.current.geometry?.dispose();
        currentPreviewRef.current = null;
      }

      const points = [
        new THREE.Vector3(startPoint.x, 0, startPoint.z),
        new THREE.Vector3(endPoint.x, 0, startPoint.z),
        new THREE.Vector3(endPoint.x, 0, endPoint.z),
        new THREE.Vector3(startPoint.x, 0, endPoint.z),
        new THREE.Vector3(startPoint.x, 0, startPoint.z)
      ];
      
      setSketchPoints(points);
      updateSketchLine(points);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const startCircle = (startEvent) => {
    const center = pointerToPlane(startEvent);
    if (!center) return;
    
    setIsDrawing(true);
    lastPointerPointRef.current = center.clone();

    if (currentPreviewRef.current) {
      sceneRef.current.remove(currentPreviewRef.current);
      currentPreviewRef.current.geometry?.dispose();
      currentPreviewRef.current = null;
    }

    const circleSegments = 32;
    const previewGeom = new THREE.BufferGeometry();
    const previewMat = new THREE.LineBasicMaterial({ color: 0x00ff00 });
    
    const preview = new THREE.Line(previewGeom, previewMat);
    sceneRef.current.add(preview);
    currentPreviewRef.current = preview;

    const onMove = (moveEvent) => {
      const p = pointerToPlane(moveEvent);
      if (!p) return;
      
      lastPointerPointRef.current = p.clone();
      const radius = center.distanceTo(p);
      
      const pts = Array.from({ length: circleSegments + 1 }, (_, i) => {
        const angle = (i / circleSegments) * Math.PI * 2;
        return new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          0.01,
          center.z + Math.sin(angle) * radius
        );
      });
      
      preview.geometry.dispose();
      preview.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      updateSketchLine(pts);
    };

    const onUp = () => {
      setIsDrawing(false);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const p = lastPointerPointRef.current || center;
      const radius = center.distanceTo(p);

      const pts = Array.from({ length: circleSegments + 1 }, (_, i) => {
        const angle = (i / circleSegments) * Math.PI * 2;
        return new THREE.Vector3(
          center.x + Math.cos(angle) * radius,
          0,
          center.z + Math.sin(angle) * radius
        );
      });

      if (currentPreviewRef.current) {
        sceneRef.current.remove(currentPreviewRef.current);
        currentPreviewRef.current.geometry?.dispose();
        currentPreviewRef.current = null;
      }

      setSketchPoints(pts);
      updateSketchLine(pts);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handlePolygonClick = (event) => {
    const p = pointerToPlane(event);
    if (!p) return;
    
    setSketchPoints(prev => {
      const newPts = [...prev, p.clone()];
      updateSketchLine(newPts);
      return newPts;
    });
  };

  const updateSketchLine = (pointsArray) => {
    if (!sketchLineRef.current) return;
    
    const pts = pointsArray.map(p => new THREE.Vector3(p.x, 0.01, p.z));
    const geom = new THREE.BufferGeometry().setFromPoints(pts);
    
    sketchLineRef.current.geometry.dispose();
    sketchLineRef.current.geometry = geom;
  };

  const extrudeSketch = () => {
    if (!sceneRef.current || sketchPoints.length < 3) {
      alert("Need at least 3 points to extrude");
      return;
    }

    try {
      const shape = new THREE.Shape();
      shape.moveTo(sketchPoints[0].x, sketchPoints[0].z);
      
      for (let i = 1; i < sketchPoints.length; i++) {
        shape.lineTo(sketchPoints[i].x, sketchPoints[i].z);
      }

      const first = sketchPoints[0];
      const last = sketchPoints[sketchPoints.length - 1];
      if (first.distanceTo(last) > 0.1) {
        shape.lineTo(first.x, first.z);
      }

      const extrudeSettings = { 
        depth: extrusionHeight, 
        bevelEnabled: false, 
        steps: 1 
      };
      
      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
      geometry.rotateX(-Math.PI / 2);

      const container = createMeshWithEdges(geometry);
      container.userData.type = "extruded";

      const center = new THREE.Vector3();
      sketchPoints.forEach(point => center.add(point));
      center.divideScalar(sketchPoints.length);
      container.position.copy(center);
      container.position.y = extrusionHeight / 2;

      sceneRef.current.add(container);
      objectsRef.current.push(container);

      setSelectedEntity(container);
      clearAllHighlights();
      highlightEntity(container);
      clearSketch();
      saveHistory();

    } catch (error) {
      console.error("Extrusion failed:", error);
      alert("Extrusion failed: " + error.message);
    }
  };

  // ====== EXPORT/IMPORT ======
  const exportScene = () => {
    const sceneData = {
      objects: objectsRef.current.map(obj => ({
        type: obj.userData?.type || 'unknown',
        position: [obj.position.x, obj.position.y, obj.position.z],
        rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z],
        color: obj.userData.originalColor || 0xffffff,
        userData: { ...obj.userData }
      })),
      metadata: {
        version: '1.0',
        exportDate: new Date().toISOString(),
        objectCount: objectsRef.current.length
      }
    };

    // Clean userData
    sceneData.objects.forEach(obj => {
      delete obj.userData.originalColor;
      Object.keys(obj.userData).forEach(key => {
        if (typeof obj.userData[key] === 'function' || 
            obj.userData[key] instanceof THREE.Object3D) {
          delete obj.userData[key];
        }
      });
    });

    const dataStr = JSON.stringify(sceneData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cad-scene.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importScene = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const sceneData = JSON.parse(e.target.result);
        clearAllObjects();
        
        sceneData.objects.forEach(objData => {
          let geometry;
          switch (objData.type) {
            case 'box':
              geometry = new THREE.BoxGeometry(1, 1, 1);
              break;
            case 'sphere':
              geometry = new THREE.SphereGeometry(0.5, 32, 32);
              break;
            case 'cylinder':
              geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
              break;
            case 'extruded':
              geometry = new THREE.BoxGeometry(1, 1, 1);
              break;
            default:
              geometry = new THREE.BoxGeometry(1, 1, 1);
          }

          const container = createMeshWithEdges(geometry, objData.color);
          container.position.set(...objData.position);
          container.rotation.set(...objData.rotation);
          container.scale.set(...objData.scale);
          container.userData = { 
            ...objData.userData, 
            originalColor: objData.color,
            type: objData.type 
          };

          sceneRef.current.add(container);
          objectsRef.current.push(container);
        });

        saveHistory();
        
      } catch (error) {
        console.error('Import failed:', error);
        alert('Failed to import scene: ' + error.message);
      }
    };
    
    reader.readAsText(file);
    event.target.value = '';
  };

  // ====== KEYBOARD CONTROLS ======
  useEffect(() => {
    const handleKeyPress = (evt) => {
      if (!selectedEntity) return;
      
      switch (evt.key.toLowerCase()) {
        case "w": transformSelected({ type: "translate", vector: new THREE.Vector3(0, 0, -GRID_SNAP) }); break;
        case "s": transformSelected({ type: "translate", vector: new THREE.Vector3(0, 0, GRID_SNAP) }); break;
        case "a": transformSelected({ type: "translate", vector: new THREE.Vector3(-GRID_SNAP, 0, 0) }); break;
        case "d": transformSelected({ type: "translate", vector: new THREE.Vector3(GRID_SNAP, 0, 0) }); break;
        case "q": transformSelected({ type: "translate", vector: new THREE.Vector3(0, GRID_SNAP, 0) }); break;
        case "e": transformSelected({ type: "translate", vector: new THREE.Vector3(0, -GRID_SNAP, 0) }); break;
        case "r": transformSelected({ type: "rotate", axis: "y", angle: -0.2 }); break;
        case "f": transformSelected({ type: "rotate", axis: "y", angle: 0.2 }); break;
        case "t": transformSelected({ type: "scale", vector: new THREE.Vector3(1.2, 1.2, 1.2) }); break;
        case "g": transformSelected({ type: "scale", vector: new THREE.Vector3(0.8, 0.8, 0.8) }); break;
        case "delete":
          deleteSelected();
          break;
        case "escape":
          setSelectedEntity(null);
          setSelectedEntities([]);
          clearAllHighlights();
          break;
        case "z":
          if (evt.ctrlKey || evt.metaKey) {
            evt.preventDefault();
            undo();
          }
          break;
        case "y":
          if (evt.ctrlKey || evt.metaKey) {
            evt.preventDefault();
            redo();
          }
          break;
        case "g":
          if (evt.ctrlKey || evt.metaKey) {
            evt.preventDefault();
            groupSelected();
          }
          break;
        case "u":
          if (evt.ctrlKey || evt.metaKey) {
            evt.preventDefault();
            ungroupSelected();
          }
          break;
        default: break;
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [selectedEntity, selectedEntities]);

  // ====== UI COMPONENTS ======
  const TransformationControls = () => {
    if (!selectedEntity) return null;

    return (
      <div style={{ marginBottom: 15, padding: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 6 }}>
        <strong style={{ color: '#FFD700' }}>Transformation Controls</strong>
        
        <div style={{ marginTop: 8 }}>
          <strong>Move:</strong>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {[
              { axis: 'x', label: 'X+', vec: new THREE.Vector3(GRID_SNAP, 0, 0) },
              { axis: 'y', label: 'Y+', vec: new THREE.Vector3(0, GRID_SNAP, 0) },
              { axis: 'z', label: 'Z+', vec: new THREE.Vector3(0, 0, GRID_SNAP) },
              { axis: 'x-', label: 'X-', vec: new THREE.Vector3(-GRID_SNAP, 0, 0) },
              { axis: 'y-', label: 'Y-', vec: new THREE.Vector3(0, -GRID_SNAP, 0) },
              { axis: 'z-', label: 'Z-', vec: new THREE.Vector3(0, 0, -GRID_SNAP) }
            ].map(({ axis, label, vec }) => (
              <button
                key={axis}
                onClick={() => transformSelected({ type: "translate", vector: vec })}
                style={{ 
                  padding: '6px 8px', 
                  fontSize: '11px', 
                  background: '#2196F3',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  flex: 1
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <strong>Rotate:</strong>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {[
              { axis: 'x', label: 'X+', angle: 0.2 },
              { axis: 'y', label: 'Y+', angle: 0.2 },
              { axis: 'z', label: 'Z+', angle: 0.2 },
              { axis: 'x-', label: 'X-', angle: -0.2 },
              { axis: 'y-', label: 'Y-', angle: -0.2 },
              { axis: 'z-', label: 'Z-', angle: -0.2 }
            ].map(({ axis, label, angle }) => (
              <button
                key={axis}
                onClick={() => transformSelected({ type: "rotate", axis: axis.replace('-', ''), angle: angle })}
                style={{ 
                  padding: '6px 8px', 
                  fontSize: '11px', 
                  background: '#9C27B0',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  flex: 1
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 8 }}>
          <strong>Scale:</strong>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            <button
              onClick={() => transformSelected({ type: "scale", vector: new THREE.Vector3(1.2, 1.2, 1.2) })}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px', 
                background: '#4CAF50',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                flex: 1
              }}
            >
              Scale Up
            </button>
            <button
              onClick={() => transformSelected({ type: "scale", vector: new THREE.Vector3(0.8, 0.8, 0.8) })}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px', 
                background: '#FF9800',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                flex: 1
              }}
            >
              Scale Down
            </button>
          </div>
        </div>

        {/* Grouping Controls */}
        {selectedEntities.length > 1 && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={groupSelected}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px', 
                background: '#FF5722',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                width: '100%'
              }}
            >
              Group Selected ({selectedEntities.length})
            </button>
          </div>
        )}

        {selectedEntity && selectedEntity.userData.isGroup && (
          <div style={{ marginTop: 8 }}>
            <button
              onClick={ungroupSelected}
              style={{ 
                padding: '6px 8px', 
                fontSize: '11px', 
                background: '#795548',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                width: '100%'
              }}
            >
              Ungroup
            </button>
          </div>
        )}
      </div>
    );
  };

  const SelectionModeControls = () => (
    <div style={{ marginBottom: 15 }}>
      <strong>Selection Mode:</strong>
      <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
        {[
          { mode: "shape", label: "Shape", color: "#4CAF50" },
          { mode: "face", label: "Face", color: "#2196F3" },
          { mode: "edge", label: "Edge", color: "#9C27B0" }
        ].map(({ mode, label, color }) => (
          <button
            key={mode}
            onClick={() => setSelectionMode(mode)}
            style={{
              padding: '6px 8px',
              fontSize: '10px',
              background: selectionMode === mode ? color : '#666',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              flex: 1
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );

  // ====== MAIN RENDER ======
  const entityProperties = getEntityProperties();
  const backgroundOptions = [
    { name: "Dark Blue", value: "#1a1a2e" },
    { name: "White", value: "#ffffff" },
    { name: "Navy", value: "#0a1931" },
  ];

  return (
    <div>
      <div 
        ref={mountRef} 
        style={{ width: "100vw", height: "100vh" }} 
        onPointerDown={handleMultiSelect}
      />
      
      {/* UI Panel */}
      <div style={{ 
        position: "absolute", 
        top: 10, 
        left: 10, 
        background: "rgba(0,0,0,0.9)", 
        padding: 15, 
        borderRadius: 8, 
        color: "white", 
        maxWidth: 400,
        fontFamily: 'Arial, sans-serif',
        fontSize: '13px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        maxHeight: '95vh',
        overflowY: 'auto'
      }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#4CAF50' }}>✏️ CAD Editor</h3>
        
        {/* History Controls */}
        <div style={{ marginBottom: 15, display: 'flex', gap: 8 }}>
          <button onClick={undo} disabled={historyIndex <= 0} style={{ padding: '8px 12px', background: historyIndex <= 0 ? '#666' : '#2196F3', color: 'white', border: 'none', borderRadius: 6, flex: 1 }}>
            ⬅️ Undo
          </button>
          <button onClick={redo} disabled={historyIndex >= history.length - 1} style={{ padding: '8px 12px', background: historyIndex >= history.length - 1 ? '#666' : '#2196F3', color: 'white', border: 'none', borderRadius: 6, flex: 1 }}>
            ➡️ Redo
          </button>
        </div>

        {/* Scene Management */}
        <div style={{ marginBottom: 15, display: 'flex', gap: 8 }}>
          <button onClick={exportScene} style={{ padding: '8px 12px', background: '#2196F3', color: 'white', border: 'none', borderRadius: 6, flex: 1 }}>
            Export
          </button>
          <label style={{ flex: 1 }}>
            <input type="file" accept=".json" onChange={importScene} style={{ display: 'none' }} />
            <div style={{ padding: '8px 12px', background: '#4CAF50', color: 'white', border: 'none', borderRadius: 6, textAlign: 'center', cursor: 'pointer' }}>
              Import
            </div>
          </label>
          <button onClick={clearAllObjects} style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: 6 }}>
            Clear
          </button>
        </div>

        {/* Background Selector */}
        <div style={{ marginBottom: 15 }}>
          <strong>Background:</strong>
          <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
            {backgroundOptions.map(bg => (
              <button
                key={bg.value}
                onClick={() => setSceneBackground(bg.value)}
                style={{ 
                  padding: '6px 10px', 
                  fontSize: '11px',
                  background: bg.value,
                  color: 'white',
                  border: sceneBackground === bg.value ? '2px solid #4CAF50' : '1px solid #666',
                  borderRadius: 4
                }}
              >
                {bg.name}
              </button>
            ))}
          </div>
        </div>

        {/* Selection Mode */}
        <SelectionModeControls />

        {/* Mode Selection */}
        <div style={{ marginBottom: 15 }}>
          <strong>Mode:</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {["select", "sketch-rect", "sketch-circle", "sketch-poly"].map(modeName => (
              <button
                key={modeName}
                onClick={() => setMode(modeName)}
                style={{ 
                  padding: '8px 12px',
                  background: mode === modeName ? '#4CAF50' : '#555',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  flex: 1,
                  minWidth: '80px'
                }}
              >
                {modeName.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
              </button>
            ))}
          </div>
        </div>

        {/* Sketch Controls */}
        {mode.startsWith("sketch") && (
          <div style={{ marginBottom: 15, padding: 12, background: 'rgba(255,255,255,0.1)', borderRadius: 6 }}>
            <div style={{ marginBottom: 10 }}>
              <strong>Extrusion Height: {extrusionHeight}m</strong>
              <input
                type="range"
                min="0.1"
                max="5"
                step="0.1"
                value={extrusionHeight}
                onChange={(e) => setExtrusionHeight(parseFloat(e.target.value))}
                style={{ width: '100%', marginTop: 4 }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={extrudeSketch} disabled={sketchPoints.length < 3} style={{ padding: '8px 12px', background: sketchPoints.length < 3 ? '#666' : '#FF9800', color: 'white', border: 'none', borderRadius: 4, flex: 1 }}>
                Extrude
              </button>
              <button onClick={clearSketch} style={{ padding: '8px 12px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, flex: 1 }}>
                Clear
              </button>
            </div>
            {mode === "sketch-poly" && (
              <div style={{ fontSize: '11px', color: '#aaa' }}>
                • Click to add points • Double-click to finish
              </div>
            )}
          </div>
        )}

        {/* Primitive Creation */}
        <div style={{ marginBottom: 15 }}>
          <strong>Create Primitives:</strong>
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {["box", "sphere", "cylinder"].map(type => (
              <button
                key={type}
                onClick={() => addShape(type)}
                style={{ 
                  padding: '8px 12px',
                  background: '#9C27B0',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  flex: 1
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Transformation Controls */}
        <TransformationControls />

        {/* Selected Entity Properties */}
        {selectedEntity && entityProperties && (
          <div style={{ marginBottom: 15, padding: 12, background: 'rgba(76, 175, 80, 0.2)', borderRadius: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <strong style={{ color: '#4CAF50' }}>
                Selected: {selectedEntity.userData?.type?.toUpperCase() || "OBJECT"}
              </strong>
              <button onClick={deleteSelected} style={{ padding: '4px 8px', background: '#f44336', color: 'white', border: 'none', borderRadius: 4, fontSize: '11px' }}>
                Delete
              </button>
            </div>
            {Object.entries(entityProperties).map(([key, value]) => (
              <div key={key} style={{ fontSize: '12px', marginBottom: 4, display: 'flex' }}>
                <span style={{ color: '#aaa', minWidth: '100px' }}>{key}:</span>
                <span style={{ flex: 1 }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Controls Help */}
        <div style={{ fontSize: '11px', color: '#aaa', lineHeight: '1.4', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: 10 }}>
          <strong>Controls:</strong><br/>
          • Click: Select objects<br/>
          • Shift+Click: Multi-select<br/>
          • WASD: Move selected<br/>
          • Q/E: Move up/down<br/>
          • R/F: Rotate Y axis<br/>
          • T/G: Scale up/down<br/>
          • Delete: Remove selected<br/>
          • ESC: Clear selection<br/>
          • Ctrl+Z/Y: Undo/Redo<br/>
          • Ctrl+G/U: Group/Ungroup
        </div>
      </div>
    </div>
  );
}