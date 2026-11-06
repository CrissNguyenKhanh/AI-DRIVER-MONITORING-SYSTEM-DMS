import { useEffect, useRef } from "react";
import * as THREE from "three";

const DEFAULT_LANE_WIDTH = 3.6;
const DEFAULT_LANE_COUNT = 3;
const ROAD_START = -180;
const ROAD_END = 1700;

function disposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
}

function laneCenter(lane, laneCount, laneWidth) {
  return (Number(lane) - (laneCount - 1) / 2) * laneWidth;
}

function curveOffset(z, amplitude) {
  return Math.sin(z / 92) * amplitude;
}

function curveHeading(z, amplitude) {
  return Math.atan((Math.cos(z / 92) * amplitude) / 92);
}

function createVehicle(color, variant = "sedan") {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.5 });
  const trimMaterial = new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.42, metalness: 0.35 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x76b9e8,
    roughness: 0.08,
    metalness: 0.05,
    transmission: 0.18,
    transparent: true,
    opacity: 0.78,
  });
  const bodyLength = variant === "van" ? 4.8 : variant === "compact" ? 3.8 : 4.35;
  const bodyHeight = variant === "van" ? 0.94 : 0.72;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.84, bodyHeight, bodyLength), bodyMaterial);
  body.position.y = 0.62;
  body.castShadow = true;
  group.add(body);

  const hood = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.22, 1.2), bodyMaterial);
  hood.position.set(0, 0.94, bodyLength * 0.29);
  hood.castShadow = true;
  group.add(hood);
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(variant === "van" ? 1.65 : 1.48, variant === "van" ? 0.9 : 0.7, variant === "van" ? 2.25 : 1.95),
    glassMaterial,
  );
  cabin.position.set(0, variant === "van" ? 1.42 : 1.28, -0.08);
  cabin.castShadow = true;
  group.add(cabin);

  const wheels = [];
  for (const x of [-0.94, 0.94]) {
    for (const z of [-bodyLength * 0.29, bodyLength * 0.29]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.25, 18), trimMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, 0.37, z);
      wheel.castShadow = true;
      group.add(wheel);
      wheels.push(wheel);
    }
  }

  const headlightMaterial = new THREE.MeshStandardMaterial({
    color: 0xfff4ca,
    emissive: 0xfff0a0,
    emissiveIntensity: 2.5,
  });
  const brakeMaterial = new THREE.MeshStandardMaterial({ color: 0x8a0b16, emissive: 0xff1028, emissiveIntensity: 0.6 });
  const indicatorMaterial = new THREE.MeshStandardMaterial({ color: 0x5a3100, emissive: 0xffa000, emissiveIntensity: 0 });
  const brakeLights = [];
  const indicators = [];
  for (const x of [-0.62, 0.62]) {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.08), headlightMaterial);
    front.position.set(x, 0.72, bodyLength / 2 + 0.04);
    group.add(front);
    const rear = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.17, 0.08), brakeMaterial.clone());
    rear.position.set(x, 0.72, -bodyLength / 2 - 0.04);
    group.add(rear);
    brakeLights.push(rear);
    const indicator = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.09), indicatorMaterial.clone());
    indicator.position.set(x > 0 ? 0.82 : -0.82, 0.73, -bodyLength / 2 - 0.05);
    group.add(indicator);
    indicators.push(indicator);
  }
  group.userData = { wheels, brakeLights, indicators, bodyLength };
  return group;
}

function createObstacleMesh(obstacle) {
  if (obstacle.kind === "vehicle" || obstacle.type === "vehicle") {
    const variants = ["sedan", "compact", "van"];
    const variant = variants[Math.abs(String(obstacle.id).length) % variants.length];
    return createVehicle(obstacle.color || (obstacle.dynamic ? 0xf59e0b : 0xe5484d), variant);
  }
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.width || 1.8, obstacle.height || 1.5, obstacle.length || 2.4),
    new THREE.MeshStandardMaterial({ color: obstacle.dynamic ? 0xf59e0b : 0xef4444, roughness: 0.7 }),
  );
  mesh.position.y = (obstacle.height || 1.5) / 2;
  mesh.castShadow = true;
  return mesh;
}

function createRoad(scene, laneCount, laneWidth, amplitude) {
  const roadWidth = laneCount * laneWidth;
  const asphalt = new THREE.MeshStandardMaterial({ color: 0x1b242d, roughness: 0.91, metalness: 0.03 });
  const shoulder = new THREE.MeshStandardMaterial({ color: 0x4d555c, roughness: 0.88 });
  const verge = new THREE.MeshStandardMaterial({ color: 0x294e35, roughness: 1 });
  const white = new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.64 });
  const barrier = new THREE.MeshStandardMaterial({ color: 0x8e9ba5, roughness: 0.5, metalness: 0.6 });
  const segments = new THREE.Group();

  for (let z = ROAD_START; z < ROAD_END; z += 20) {
    const mid = z + 10;
    const offset = curveOffset(mid, amplitude);
    const heading = curveHeading(mid, amplitude);
    const road = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.09, 20.5), asphalt);
    road.position.set(offset, 0, mid);
    road.rotation.y = heading;
    road.receiveShadow = true;
    segments.add(road);
    for (const side of [-1, 1]) {
      const paved = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 20.5), shoulder);
      paved.position.set(offset + side * (roadWidth / 2 + 0.8), -0.01, mid);
      paved.rotation.y = heading;
      paved.receiveShadow = true;
      segments.add(paved);
      const grass = new THREE.Mesh(new THREE.BoxGeometry(17, 0.05, 20.5), verge);
      grass.position.set(offset + side * (roadWidth / 2 + 10.1), -0.05, mid);
      grass.rotation.y = heading;
      grass.receiveShadow = true;
      segments.add(grass);
    }
  }

  for (let boundary = 1; boundary < laneCount; boundary += 1) {
    const laneX = -roadWidth / 2 + boundary * laneWidth;
    for (let z = ROAD_START; z < ROAD_END; z += 12) {
      const mid = z + 3;
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.035, 5.8), white);
      dash.position.set(curveOffset(mid, amplitude) + laneX, 0.07, mid);
      dash.rotation.y = curveHeading(mid, amplitude);
      segments.add(dash);
    }
  }
  for (const side of [-1, 1]) {
    for (let z = ROAD_START; z < ROAD_END; z += 20) {
      const mid = z + 10;
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 20.5), white);
      edge.position.set(curveOffset(mid, amplitude) + side * roadWidth / 2, 0.07, mid);
      edge.rotation.y = curveHeading(mid, amplitude);
      segments.add(edge);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.28, 20.2), barrier);
      rail.position.set(curveOffset(mid, amplitude) + side * (roadWidth / 2 + 1.7), 0.54, mid);
      rail.rotation.y = curveHeading(mid, amplitude);
      rail.castShadow = true;
      segments.add(rail);
    }
  }

  const poleMaterial = new THREE.MeshStandardMaterial({ color: 0x4d5b65, metalness: 0.75, roughness: 0.35 });
  const lampMaterial = new THREE.MeshStandardMaterial({ color: 0xfff0b0, emissive: 0xffdc73, emissiveIntensity: 1.8 });
  const signMaterial = new THREE.MeshStandardMaterial({ color: 0x1565a8, roughness: 0.42 });
  for (let z = -80; z < 900; z += 72) {
    const side = Math.floor(z / 72) % 2 === 0 ? -1 : 1;
    const offset = curveOffset(z, amplitude);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 6, 10), poleMaterial);
    pole.position.set(offset + side * (roadWidth / 2 + 3.2), 3, z);
    pole.castShadow = true;
    segments.add(pole);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.32), lampMaterial);
    lamp.position.set(offset + side * (roadWidth / 2 + 2.86), 5.85, z);
    segments.add(lamp);
  }
  for (let z = 45; z < 900; z += 170) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.05, 0.1), signMaterial);
    sign.position.set(curveOffset(z, amplitude) - roadWidth / 2 - 3, 2.3, z);
    sign.rotation.y = curveHeading(z, amplitude);
    sign.castShadow = true;
    segments.add(sign);
  }
  scene.add(segments);
}

function createScenery(scene, roadWidth, amplitude) {
  const mountainMaterial = new THREE.MeshStandardMaterial({ color: 0x54726a, roughness: 1, flatShading: true });
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x604328, roughness: 1 });
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x1f6b3d, roughness: 1 });
  for (let z = -100; z < 1200; z += 36) {
    for (const side of [-1, 1]) {
      const spread = 5 + ((z * 13) % 17) * 0.38;
      const x = curveOffset(z, amplitude) + side * (roadWidth / 2 + spread);
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 2.1, 7), trunkMaterial);
      trunk.position.set(x, 1.05, z);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.95, 2.8, 9), crownMaterial);
      crown.position.set(x, 3.1, z);
      scene.add(trunk, crown);
    }
  }
  for (let index = 0; index < 12; index += 1) {
    const mountain = new THREE.Mesh(new THREE.ConeGeometry(32 + index * 2, 42 + (index % 3) * 10, 7), mountainMaterial);
    mountain.position.set((index - 5.5) * 42, 11, 430 + (index % 2) * 80);
    scene.add(mountain);
  }
}

export default function VirtualRoadScene({ snapshot, cameraMode, onCanvasReady, onRendererStatus }) {
  const mountRef = useRef(null);
  const snapshotRef = useRef(snapshot);
  const cameraModeRef = useRef(cameraMode);

  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, powerPreference: "high-performance" });
      onRendererStatus?.("READY");
    } catch {
      onRendererStatus?.("UNAVAILABLE");
      return undefined;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x88b7d4);
    scene.fog = new THREE.FogExp2(0x88b7d4, 0.0032);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("role", "img");
    renderer.domElement.setAttribute("aria-label", "Cảnh đường ba chiều của xe và vật cản trong mô phỏng an toàn");
    mount.appendChild(renderer.domElement);
    onCanvasReady?.(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 750);
    scene.add(new THREE.HemisphereLight(0xeaf8ff, 0x243f2d, 2.35));
    const sun = new THREE.DirectionalLight(0xfff4dc, 2.8);
    sun.position.set(-24, 46, -18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1536, 1536);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    scene.add(sun, sun.target);

    const initialRoad = snapshotRef.current?.road || {};
    const laneCount = initialRoad.laneCount || DEFAULT_LANE_COUNT;
    const laneWidth = initialRoad.laneWidth || DEFAULT_LANE_WIDTH;
    const amplitude = initialRoad.visualCurveAmplitude || 0;
    createRoad(scene, laneCount, laneWidth, amplitude);
    createScenery(scene, laneCount * laneWidth, amplitude);

    const egoMesh = createVehicle(0x19d3a2, "sedan");
    scene.add(egoMesh);
    const obstacleMeshes = new Map();
    const dangerZone = new THREE.Mesh(
      new THREE.RingGeometry(1.6, 3.5, 40),
      new THREE.MeshBasicMaterial({ color: 0xff334f, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),
    );
    dangerZone.rotation.x = -Math.PI / 2;
    dangerZone.position.y = 0.1;
    dangerZone.visible = false;
    scene.add(dangerZone);
    const trajectoryGeometry = new THREE.BufferGeometry();
    const trajectoryPositions = new Float32Array(11 * 3);
    trajectoryGeometry.setAttribute("position", new THREE.BufferAttribute(trajectoryPositions, 3));
    const trajectory = new THREE.Line(
      trajectoryGeometry,
      new THREE.LineBasicMaterial({ color: 0x24e0c0, transparent: true, opacity: 0.9 }),
    );
    scene.add(trajectory);
    const cameraPosition = new THREE.Vector3(7, 7, -13);
    const lookTarget = new THREE.Vector3(0, 1, 15);
    const desired = new THREE.Vector3();
    const desiredLook = new THREE.Vector3();

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
    const clock = new THREE.Clock();

    renderer.setAnimationLoop(() => {
      const delta = Math.min(0.05, clock.getDelta());
      const current = snapshotRef.current || {};
      const ego = current.ego || {};
      const roadState = current.road || {};
      const currentLaneWidth = roadState.laneWidth || laneWidth;
      const currentLaneCount = roadState.laneCount || laneCount;
      const currentAmplitude = roadState.visualCurveAmplitude || amplitude;
      const rawEgoX = Number.isFinite(ego.x) ? ego.x : laneCenter(ego.currentLane || 1, currentLaneCount, currentLaneWidth);
      const egoZ = Number.isFinite(ego.s) ? ego.s : Number(ego.position || 0);
      const egoX = rawEgoX + curveOffset(egoZ, currentAmplitude);
      egoMesh.position.set(egoX, 0, egoZ);
      egoMesh.rotation.y = curveHeading(egoZ, currentAmplitude) + Number(ego.heading || 0);
      const wheelSpin = Number(ego.speed || 0) * delta / 0.35;
      egoMesh.userData.wheels.forEach((wheel) => { wheel.rotation.x -= wheelSpin; });
      const braking = Number(ego.acceleration || 0) < -0.25;
      egoMesh.userData.brakeLights.forEach((light) => { light.material.emissiveIntensity = braking ? 4.5 : 0.55; });
      const targetLane = ego.targetLane;
      const turnDirection = targetLane == null ? 0 : Math.sign(targetLane - ego.currentLane);
      const blink = Math.floor(Number(current.time || 0) * 2.5) % 2 === 0;
      egoMesh.userData.indicators.forEach((indicator, index) => {
        const side = index === 0 ? -1 : 1;
        indicator.material.emissiveIntensity = blink && side === turnDirection ? 4 : 0;
      });

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
        const rawX = Number.isFinite(obstacle.x) ? obstacle.x : laneCenter(obstacle.lane || 1, currentLaneCount, currentLaneWidth);
        const z = Number.isFinite(obstacle.s) ? obstacle.s : Number(obstacle.position || 0);
        mesh.position.x = rawX + curveOffset(z, currentAmplitude);
        mesh.position.z = z;
        mesh.rotation.y = curveHeading(z, currentAmplitude);
        mesh.visible = obstacle.active !== false;
        mesh.userData.wheels?.forEach((wheel) => { wheel.rotation.x -= Number(obstacle.speed || 0) * delta / 0.35; });
      }
      for (const [id, mesh] of obstacleMeshes) {
        if (!activeIds.has(id)) {
          scene.remove(mesh);
          disposeObject(mesh);
          obstacleMeshes.delete(id);
        }
      }

      const hazardId = current.risk?.frontHazard?.obstacleId;
      const hazard = hazardId ? obstacleMeshes.get(String(hazardId)) : null;
      dangerZone.visible = Boolean(hazard?.visible);
      if (dangerZone.visible) {
        dangerZone.position.set(hazard.position.x, 0.12, hazard.position.z);
        dangerZone.scale.setScalar(1 + Math.sin(Number(current.time || 0) * 5) * 0.08);
      }

      const plannedLane = ego.targetLane ?? ego.currentLane ?? 1;
      const plannedRawX = laneCenter(plannedLane, currentLaneCount, currentLaneWidth);
      let pointIndex = 0;
      for (let distance = 5; distance <= 55; distance += 5) {
        const z = egoZ + distance;
        const blend = Math.min(1, distance / 38);
        const rawX = rawEgoX + (plannedRawX - rawEgoX) * (blend * blend * (3 - 2 * blend));
        const offset = pointIndex * 3;
        trajectoryPositions[offset] = rawX + curveOffset(z, currentAmplitude);
        trajectoryPositions[offset + 1] = 0.13;
        trajectoryPositions[offset + 2] = z;
        pointIndex += 1;
      }
      trajectoryGeometry.attributes.position.needsUpdate = true;
      trajectory.visible = targetLane != null || Boolean(current.risk?.frontHazard);

      const mode = cameraModeRef.current;
      if (mode === "DRIVER") {
        desired.set(egoX, 2, egoZ + 0.7);
        desiredLook.set(egoX + curveOffset(egoZ + 45, currentAmplitude) - curveOffset(egoZ, currentAmplitude), 1.05, egoZ + 45);
      } else if (mode === "REAR") {
        desired.set(egoX, 3.5, egoZ + 11);
        desiredLook.set(egoX, 1, egoZ - 24);
      } else if (mode === "CINEMATIC") {
        desired.set(egoX - 12, 5.2, egoZ + 2);
        desiredLook.set(egoX, 0.9, egoZ + 14);
      } else {
        desired.set(egoX + 7.4, 6.7, egoZ - 13.8);
        desiredLook.set(egoX, 0.85, egoZ + 15);
      }
      const smoothing = 1 - Math.exp(-delta * 5.5);
      cameraPosition.lerp(desired, smoothing);
      lookTarget.lerp(desiredLook, smoothing);
      camera.position.copy(cameraPosition);
      camera.lookAt(lookTarget);
      sun.position.set(egoX - 24, 46, egoZ - 18);
      sun.target.position.set(egoX, 0, egoZ + 18);
      renderer.render(scene, camera);
    });

    return () => {
      renderer.setAnimationLoop(null);
      resizeObserver.disconnect();
      onCanvasReady?.(null);
      onRendererStatus?.("UNAVAILABLE");
      obstacleMeshes.forEach((mesh) => disposeObject(mesh));
      disposeObject(scene);
      renderer.dispose();
      renderer.forceContextLoss?.();
      renderer.domElement.remove();
    };
  }, [onCanvasReady, onRendererStatus]);

  return <div className="road-sim-three" ref={mountRef} />;
}
