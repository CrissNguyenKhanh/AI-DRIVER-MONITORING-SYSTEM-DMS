import React, { useRef, useEffect } from "react";
import * as THREE from "three";

/**
 * Three.js head model phản ánh góc pitch/yaw/roll từ poseRef.
 * Props: poseRef — ref có dạng { yaw, pitch, roll } (radian)
 */
export default function Head3D({ poseRef }) {
  const mountRef = useRef(null);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;

    const W = el.clientWidth || 280, H = el.clientHeight || 260;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W/H, 0.1, 100);
    camera.position.set(0, 0.1, 3.4); camera.lookAt(0, 0.1, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(2, 3, 4); scene.add(key);
    const fill = new THREE.DirectionalLight(0xaabbcc, 0.4);
    fill.position.set(-2, 1, 2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0x8899bb, 0.25);
    rim.position.set(0, -2, -3); scene.add(rim);

    const headGroup = new THREE.Group();
    scene.add(headGroup);

    const hMat = new THREE.MeshPhongMaterial({ color: 0xb8bcc4, shininess: 30, specular: new THREE.Color(0x444444) });
    function addS(geo, pos, sc) {
      const g = geo.clone();
      if (sc) g.applyMatrix4(new THREE.Matrix4().makeScale(sc[0], sc[1], sc[2]));
      const m = new THREE.Mesh(g, hMat);
      m.position.set(...pos); headGroup.add(m);
    }

    addS(new THREE.SphereGeometry(0.66, 48, 32), [0, 0.12, 0],   [1.0, 1.18, 0.88]);
    addS(new THREE.SphereGeometry(0.48, 32, 24), [0, -0.32, 0.05],[0.86, 0.74, 0.78]);
    addS(new THREE.SphereGeometry(0.11, 14, 10), [0, -0.02, 0.56],[0.78, 0.66, 1.1]);
    addS(new THREE.SphereGeometry(0.09, 12, 10), [-0.68, 0.04, 0],[0.5, 0.85, 0.36]);
    addS(new THREE.SphereGeometry(0.09, 12, 10), [0.68, 0.04, 0], [0.5, 0.85, 0.36]);

    const sMat = new THREE.MeshPhongMaterial({ color: 0x8a8e96, shininess: 20 });
    [[-0.22, 0.14, 0.5], [0.22, 0.14, 0.5]].forEach((p) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), sMat);
      s.position.set(...p); headGroup.add(s);
    });

    const lMat = new THREE.MeshPhongMaterial({ color: 0xd0d4da, shininess: 15 });
    [[-0.22, 0.14, 0.52], [0.22, 0.14, 0.52]].forEach((p) => {
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8), lMat);
      l.position.set(...p); l.scale.set(1, 0.38, 0.7); headGroup.add(l);
    });

    const mMat = new THREE.MeshPhongMaterial({ color: 0x9a9ea6, shininess: 10 });
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), mMat);
    mouth.position.set(0, -0.21, 0.49); mouth.scale.set(2, 0.5, 0.8); headGroup.add(mouth);

    let cY = 0, cP = 0, cR = 0, rafId;
    function animate() {
      rafId = requestAnimationFrame(animate);
      const p = poseRef.current;
      cY += ((p.yaw   || 0) - cY) * 0.12;
      cP += ((p.pitch || 0) - cP) * 0.12;
      cR += ((p.roll  || 0) - cR) * 0.12;
      headGroup.rotation.order = "YXZ";
      headGroup.rotation.y = cY;
      headGroup.rotation.x = cP;
      headGroup.rotation.z = cR;
      renderer.render(scene, camera);
    }
    animate();

    const ro = new ResizeObserver(() => {
      const nW = el.clientWidth, nH = el.clientHeight;
      renderer.setSize(nW, nH);
      camera.aspect = nW / nH; camera.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, []);

  return React.createElement("div", {
    ref: mountRef,
    style: { width: "100%", height: "100%" },
  });
}
