import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEFAULT_LANE_WIDTH = 3.6;
const DEFAULT_LANE_COUNT = 3;

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose?.());
    } else {
      child.material?.dispose?.();
    }
  });
}

function laneCenter(lane, laneCount, laneWidth) {
  return (Number(lane) - (laneCount - 1) / 2) * laneWidth;
}

function createVehicle(color, labelColor = 0xdbeafe) {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.32,
  });
  const glassMaterial = new THREE.MeshStandardMaterial({
    color: 0x86bff2,
    roughness: 0.12,
    metalness: 0.15,
    transparent: true,
    opacity: 0.78,
  });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x111827 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.72, 4.25), bodyMaterial);
  body.position.y = 0.66;
  body.castShadow = true;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.64, 1.92), glassMaterial);
  cabin.position.set(0, 1.25, -0.12);
  cabin.castShadow = true;
  group.add(cabin);
  for (const x of [-0.92, 0.92]) {
    for (const z of [-1.28, 1.28]) {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.34, 0.24, 16),
        tireMaterial,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.38, z);
      group.add(wheel);
    }
  }
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.06, 0.24),
    new THREE.MeshBasicMaterial({ color: labelColor }),
  );
  marker.position.set(0, 1.62, 0);
  group.add(marker);
  return group;
}

function createObstacleMesh(obstacle) {
  if (obstacle.kind === "vehicle" || obstacle.type === "vehicle") {
    return createVehicle(obstacle.color || 0xf97316, 0xffedd5);
  }
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(
      obstacle.width || 1.8,
      obstacle.height || 1.5,
      obstacle.length || 2.4,
    ),
    new THREE.MeshStandardMaterial({
      color: obstacle.dynamic ? 0xf59e0b : 0xef4444,
      roughness: 0.7,
    }),
  );
  mesh.position.y = (obstacle.height || 1.5) / 2;
  mesh.castShadow = true;
  return mesh;
}

function createRoad(scene, laneCount, laneWidth) {
  const roadWidth = laneCount * laneWidth;
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(roadWidth, 1800),
    new THREE.MeshStandardMaterial({ color: 0x202934, roughness: 0.94 }),
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, 700);
  road.receiveShadow = true;
  scene.add(road);

  const shoulderMaterial = new THREE.MeshStandardMaterial({ color: 0x31543a });
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Mesh(new THREE.PlaneGeometry(18, 1800), shoulderMaterial);
    shoulder.rotation.x = -Math.PI / 2;
    shoulder.position.set(side * (roadWidth / 2 + 9), -0.02, 700);
    shoulder.receiveShadow = true;
    scene.add(shoulder);
  }

  const lineMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc });
  for (let boundary = 1; boundary < laneCount; boundary += 1) {
    const x = -roadWidth / 2 + boundary * laneWidth;
    for (let z = -160; z < 1600; z += 11) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.025, 5.8), lineMaterial);
      dash.position.set(x, 0.025, z);
      scene.add(dash);
    }
  }
  for (const x of [-roadWidth / 2, roadWidth / 2]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 1800), lineMaterial);
    edge.position.set(x, 0.03, 700);
    scene.add(edge);
  }

  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x6b4423 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x1f7a45 });
  for (let z = -100; z < 1500; z += 28) {
    for (const side of [-1, 1]) {
      const offset = ((z * 17) % 13) * 0.18;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 8), trunkMaterial);
      trunk.position.y = 1.1;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(1.05, 3.1, 10), crownMaterial);
      crown.position.y = 3.25;
      tree.add(trunk, crown);
      tree.position.set(side * (roadWidth / 2 + 5.5 + offset), 0, z);
      scene.add(tree);
    }
  }
}

export default function VirtualRoadScene({ snapshot, cameraMode, onCanvasReady }) {
  const mountRef = useRef(null);
  const snapshotRef = useRef(snapshot);
  const cameraModeRef = useRef(cameraMode);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8fc8ef);
    scene.fog = new THREE.Fog(0x8fc8ef, 90, 330);

    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute(
      "aria-label",
      "Cảnh đường ba chiều của xe ảo và các vật cản trong mô phỏng",
    );
    mount.appendChild(renderer.domElement);
    onCanvasReady?.(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 650);
    scene.add(new THREE.HemisphereLight(0xe8f6ff, 0x29452f, 2.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-18, 38, -20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);

    const initialRoad = snapshotRef.current?.road || {};
    const laneCount = initialRoad.laneCount || DEFAULT_LANE_COUNT;
    const laneWidth = initialRoad.laneWidth || DEFAULT_LANE_WIDTH;
    createRoad(scene, laneCount, laneWidth);

    const egoMesh = createVehicle(0x22c55e, 0xdcfce7);
    scene.add(egoMesh);
    const obstacleMeshes = new Map();

    const resize = () => {
      const width = Math.max(1, mount.clientWidth);
      const height = Math.max(1, mount.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    renderer.setAnimationLoop(() => {
      const current = snapshotRef.current || {};
      const ego = current.ego || {};
      const roadState = current.road || {};
      const currentLaneWidth = roadState.laneWidth || laneWidth;
      const currentLaneCount = roadState.laneCount || laneCount;
      const egoX = Number.isFinite(ego.x)
        ? ego.x
        : laneCenter(ego.currentLane || 1, currentLaneCount, currentLaneWidth);
      const egoZ = Number.isFinite(ego.s)
        ? ego.s
        : Number.isFinite(ego.z)
          ? ego.z
          : Number(ego.position || 0);
      egoMesh.position.set(egoX, 0, egoZ);
      egoMesh.rotation.y = Number(ego.heading || 0);

      const activeIds = new Set();
      for (const obstacle of current.obstacles || []) {
        const id = String(obstacle.id);
        activeIds.add(id);
        let mesh = obstacleMeshes.get(id);
        if (!mesh) {
          mesh = createObstacleMesh(obstacle);
          obstacleMeshes.set(id, mesh);
          scene.add(mesh);
        }
        const x = Number.isFinite(obstacle.x)
          ? obstacle.x
          : laneCenter(obstacle.lane || 1, currentLaneCount, currentLaneWidth);
        const z = Number.isFinite(obstacle.s)
          ? obstacle.s
          : Number.isFinite(obstacle.z)
            ? obstacle.z
            : Number(obstacle.position || 0);
        mesh.position.x = x;
        mesh.position.z = z;
        mesh.visible = obstacle.active !== false;
      }
      for (const [id, mesh] of obstacleMeshes) {
        if (!activeIds.has(id)) {
          scene.remove(mesh);
          disposeObject(mesh);
          obstacleMeshes.delete(id);
        }
      }

      const mode = cameraModeRef.current;
      if (mode === "DRIVER") {
        camera.position.set(egoX, 2.05, egoZ + 0.65);
        camera.lookAt(egoX, 1.1, egoZ + 42);
      } else if (mode === "REAR") {
        camera.position.set(egoX, 3.6, egoZ + 11);
        camera.lookAt(egoX, 1.0, egoZ - 22);
      } else {
        camera.position.set(egoX + 7.8, 7.2, egoZ - 13.5);
        camera.lookAt(egoX, 0.8, egoZ + 13);
      }
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      onCanvasReady?.(null);
      obstacleMeshes.forEach((mesh) => disposeObject(mesh));
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    };
  }, [onCanvasReady]);

  return <div className="road-sim-three" ref={mountRef} />;
}
