import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Activity, RefreshCw, Zap, Cpu, Sliders, Layers } from 'lucide-react';

const MATERIALS = {
  steel: { name: 'AISI 1045 Carbon Steel', G: 79.3e9, hex: 0x64748b },
  aluminum: { name: 'Aluminum 6061-T6', G: 26.0e9, hex: 0x94a3b8 },
  brass: { name: 'C36000 Free-Cutting Brass', G: 39.0e9, hex: 0xd97706 }
};

export default function App() {
  const mountRef = useRef(null);

  // User Control States
  const [matKey, setMatKey] = useState('steel');
  const [diameter, setDiameter] = useState(25.0); // mm
  const [armLength, setArmLength] = useState(350); // mm
  const [weights, setWeights] = useState([2, 5]); // Starting weights (kg)
  const [zeroOffset, setZeroOffset] = useState(0);
  const [stressHeatmap, setStressHeatmap] = useState(false);
  const [trials, setTrials] = useState([]);

  // Physics Engine
  const physics = useMemo(() => {
    const mat = MATERIALS[matKey];
    const totalMass = weights.reduce((sum, w) => sum + w, 0);
    const forceN = totalMass * 9.80665;
    const armM = armLength / 1000.0;
    const torque = forceN * armM;

    const dM = diameter / 1000.0;
    const radiusM = dM / 2.0;
    const polarJ = (Math.PI * Math.pow(dM, 4)) / 32.0;

    const shearStressPa = polarJ > 0 ? (torque * radiusM) / polarJ : 0;
    const shearStressMPa = shearStressPa / 1e6;

    const shearStrain = shearStressPa / mat.G;
    const gaugeMicrostrain = (shearStrain / 2.0) * 1e6;
    const activeStrain = Math.max(0, gaugeMicrostrain - zeroOffset);

    return {
      totalMass,
      torque,
      polarJ,
      shearStressMPa,
      gaugeMicrostrain,
      activeStrain
    };
  }, [matKey, diameter, armLength, weights, zeroOffset]);

  // Three.js References
  const shaftMeshRef = useRef(null);
  const leverGroupRef = useRef(null);
  const weightsGroupRef = useRef(null);
  const gaugeMeshRef = useRef(null);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    // Light Neutral Studio Environment
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe2e8f0);
    scene.fog = new THREE.FogExp2(0xe2e8f0, 0.08);

    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 50);
    camera.position.set(1.1, 0.65, 1.4);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(0, 0.18, 0);

    // High Brightness Light Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(3, 5, 4);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xcbd5e1, 1.2);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    const bottomLight = new THREE.DirectionalLight(0xffffff, 0.6);
    bottomLight.position.set(0, -3, 0);
    scene.add(bottomLight);

    // Studio Grid Floor
    const gridHelper = new THREE.GridHelper(10, 40, 0x64748b, 0xcbd5e1);
    gridHelper.position.y = -0.05;
    scene.add(gridHelper);

    // Test Bench Assembly
    const benchGroup = new THREE.Group();
    scene.add(benchGroup);

    const basePlate = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.04, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.3, metalness: 0.5 })
    );
    basePlate.position.set(0, -0.02, 0);
    benchGroup.add(basePlate);

    const blockMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2, metalness: 0.7 });
    const blockLeft = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.16), blockMat);
    blockLeft.position.set(-0.55, 0.14, 0);
    const blockRight = blockLeft.clone();
    blockRight.position.set(0.55, 0.14, 0);
    benchGroup.add(blockLeft, blockRight);

    // Dynamic Shaft Mesh
    const shaftGeo = new THREE.CylinderGeometry(0.0125, 0.0125, 1.1, 48);
    shaftGeo.rotateZ(Math.PI / 2);
    const shaftMat = new THREE.MeshStandardMaterial({
      color: MATERIALS.steel.hex,
      roughness: 0.25,
      metalness: 0.65
    });
    const shaftMesh = new THREE.Mesh(shaftGeo, shaftMat);
    shaftMesh.position.set(0, 0.2, 0);
    shaftMeshRef.current = shaftMesh;
    benchGroup.add(shaftMesh);

    // Strain Gauge
    const gaugeMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.028, 0.002, 0.014),
      new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.2 })
    );
    gaugeMesh.position.set(-0.15, 0.2 + 0.0125 + 0.001, 0);
    gaugeMesh.rotation.y = Math.PI / 4;
    gaugeMeshRef.current = gaugeMesh;
    benchGroup.add(gaugeMesh);

    // Lever
    const leverGroup = new THREE.Group();
    leverGroup.position.set(0.2, 0.2, 0);

    const hubMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.022, 0.04, 32),
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.3, metalness: 0.8 })
    );
    hubMesh.geometry.rotateZ(Math.PI / 2);
    leverGroup.add(hubMesh);

    const leverBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.006, 0.52, 24),
      new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.2, metalness: 0.8 })
    );
    leverBar.geometry.rotateX(Math.PI / 2);
    leverBar.position.set(0, 0, 0.26);
    leverGroup.add(leverBar);

    // Hanger Assembly
    const hangerGroup = new THREE.Group();
    const hangerRod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.003, 0.003, 0.22, 16),
      new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8 })
    );
    hangerRod.position.y = -0.11;
    hangerGroup.add(hangerRod);

    const weightsGroup = new THREE.Group();
    weightsGroup.position.y = -0.22;
    hangerGroup.add(weightsGroup);
    weightsGroupRef.current = weightsGroup;

    leverGroup.add(hangerGroup);
    leverGroupRef.current = leverGroup;
    benchGroup.add(leverGroup);

    // Animation Loop
    let animId;
    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);
      controls.update();
      renderer.render(scene, camera);
    };
    renderLoop();

    const onResize = () => {
      if (!mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      if (mountRef.current) mountRef.current.innerHTML = '';
    };
  }, []);

  // Update Geometry & Heatmap Stress Colors
  useEffect(() => {
    const radiusM = (diameter / 2.0) / 1000.0;

    if (shaftMeshRef.current) {
      shaftMeshRef.current.scale.set(1, radiusM / 0.0125, radiusM / 0.0125);

      if (stressHeatmap) {
        const stressRatio = Math.min(physics.shearStressMPa / 40.0, 1.0);
        const hue = (1.0 - stressRatio) * 0.65; // Blue -> Yellow -> Red
        shaftMeshRef.current.material.color.setHSL(hue, 0.9, 0.5);
      } else {
        shaftMeshRef.current.material.color.setHex(MATERIALS[matKey].hex);
      }
    }

    if (gaugeMeshRef.current) {
      gaugeMeshRef.current.position.y = 0.2 + radiusM + 0.001;
    }

    if (leverGroupRef.current) {
      const hanger = leverGroupRef.current.children[2];
      if (hanger) hanger.position.z = armLength / 1000.0;

      const twistRad = (physics.torque * 0.35) / (MATERIALS[matKey].G * physics.polarJ);
      leverGroupRef.current.rotation.x = twistRad;
    }

    if (weightsGroupRef.current) {
      while (weightsGroupRef.current.children.length > 0) {
        weightsGroupRef.current.remove(weightsGroupRef.current.children[0]);
      }
      let currentY = 0;
      weights.forEach((w) => {
        const thickness = w * 0.005;
        const discMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.026, 0.026, thickness, 32),
          new THREE.MeshStandardMaterial({
            color: w === 1 ? 0x2563eb : w === 2 ? 0x0284c7 : 0x0369a1,
            metalness: 0.5,
            roughness: 0.3
          })
        );
        discMesh.position.y = currentY + thickness / 2;
        discMesh.castShadow = true;
        weightsGroupRef.current.add(discMesh);
        currentY += thickness + 0.002;
      });
    }
  }, [diameter, armLength, weights, matKey, stressHeatmap, physics]);

  const recordTrial = () => {
    setTrials((prev) => [
      ...prev,
      {
        id: prev.length + 1,
        material: matKey.toUpperCase(),
        mass: physics.totalMass,
        torque: physics.torque,
        expStrain: physics.activeStrain,
        theorStrain: physics.gaugeMicrostrain
      }
    ]);
  };

  return (
    <div className="w-screen h-screen relative bg-slate-200 font-sans text-slate-800 overflow-hidden flex select-none">
      {/* 3D Scene Viewport */}
      <div ref={mountRef} className="absolute inset-0 w-full h-full z-0" />

      {/* Top Right Floating Toolbar (No Overlap) */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => setStressHeatmap(!stressHeatmap)}
          className={`px-4 py-2.5 rounded-xl text-xs font-semibold shadow-sm border transition flex items-center gap-2 ${
            stressHeatmap
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white/90 backdrop-blur-md text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-4 h-4" />
          STRESS MAP: {stressHeatmap ? 'ACTIVE' : 'OFF'}
        </button>

        <button
          onClick={() => setZeroOffset(physics.gaugeMicrostrain)}
          className="px-4 py-2.5 bg-white/90 backdrop-blur-md border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-2 shadow-sm"
        >
          <RefreshCw className="w-4 h-4 text-slate-500" />
          TARE GAUGE
        </button>
      </div>

      {/* Main Control Panel (Integrated Header) */}
      <aside className="absolute top-4 left-4 bottom-4 w-80 z-10 bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl p-5 flex flex-col justify-between shadow-xl">
        <div className="space-y-5">
          {/* Integrated Header Title */}
          <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
            <div className="p-2.5 bg-slate-900 text-white rounded-xl shadow">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 tracking-tight">
                Torsional Lab
              </h1>
              <p className="text-[11px] font-medium text-slate-500">
                Stress & Strain Metrology
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-slate-700 font-semibold text-xs">
            <Sliders className="w-4 h-4 text-slate-500" />
            <span>Apparatus Parameters</span>
          </div>

          {/* Shaft Material Selector */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Shaft Material</label>
            <div className="grid grid-cols-3 gap-1.5 mt-2">
              {Object.keys(MATERIALS).map((key) => (
                <button
                  key={key}
                  onClick={() => setMatKey(key)}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border transition ${
                    matKey === key
                      ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {key.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Controls Sliders */}
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span>Shaft Diameter (d)</span>
                <span className="font-bold text-slate-900">{diameter.toFixed(1)} mm</span>
              </div>
              <input
                type="range" min="15" max="35" step="0.5" value={diameter}
                onChange={(e) => setDiameter(parseFloat(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1.5">
                <span>Lever Arm Length (r)</span>
                <span className="font-bold text-slate-900">{armLength} mm</span>
              </div>
              <input
                type="range" min="100" max="500" step="10" value={armLength}
                onChange={(e) => setArmLength(parseFloat(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Load Weights */}
          <div>
            <div className="flex justify-between items-center text-xs font-semibold text-slate-600">
              <span>Applied Load Mass</span>
              <span className="text-slate-900 font-bold">{physics.totalMass} kg Total</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {[1, 2, 5].map((w) => (
                <button
                  key={w}
                  onClick={() => setWeights([...weights, w])}
                  className="py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition"
                >
                  +{w} kg
                </button>
              ))}
            </div>
            <button
              onClick={() => setWeights([])}
              className="w-full mt-2 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-600 rounded-lg text-xs font-semibold transition"
            >
              Clear Masses
            </button>
          </div>
        </div>

        <button
          onClick={recordTrial}
          className="w-full mt-6 py-3 bg-slate-900 hover:bg-slate-800 font-semibold text-xs text-white rounded-xl shadow transition tracking-wide flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4 fill-white" />
          Log Experimental Trial
        </button>
      </aside>

      {/* Center Digital Meter Display */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 bg-white/95 backdrop-blur-md border border-slate-300 px-8 py-4 rounded-2xl shadow-xl flex items-center gap-8">
        <div>
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Strain Gauge Readout (45°)</div>
          <div className="text-3xl font-mono font-bold text-slate-900 mt-0.5">
            {physics.activeStrain.toFixed(1)} <span className="text-sm font-sans font-medium text-slate-500">με</span>
          </div>
        </div>

        <div className="h-10 w-[1px] bg-slate-200" />

        <div className="flex gap-6 text-xs">
          <div>
            <div className="text-slate-500 text-[10px] font-semibold">LOAD MASS</div>
            <div className="text-slate-900 font-bold mt-0.5">{physics.totalMass.toFixed(1)} kg</div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] font-semibold">APPLIED TORQUE</div>
            <div className="text-slate-900 font-bold mt-0.5">{physics.torque.toFixed(2)} N·m</div>
          </div>
          <div>
            <div className="text-slate-500 text-[10px] font-semibold">SHEAR STRESS</div>
            <div className="text-slate-900 font-bold mt-0.5">{physics.shearStressMPa.toFixed(2)} MPa</div>
          </div>
        </div>
      </div>

      {/* Trial Data Log Table Right */}
      <aside className="absolute top-20 right-4 bottom-24 w-80 z-10 bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl p-5 flex flex-col shadow-xl">
        <div className="border-b border-slate-200 pb-3 mb-3 flex items-center gap-2 text-slate-800">
          <Activity className="w-4 h-4 text-slate-500" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700">Experimental Log</h2>
        </div>

        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="text-slate-400 border-b border-slate-200 font-sans text-[11px]">
                <th className="pb-2">Mat.</th>
                <th className="pb-2">Torque</th>
                <th className="pb-2 text-right">Exp. με</th>
                <th className="pb-2 text-right">Theor. με</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {trials.length === 0 ? (
                <tr>
                  <td colSpan="4" className="py-8 text-center text-slate-400 font-sans italic">
                    No trials recorded.
                  </td>
                </tr>
              ) : (
                trials.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50 transition">
                    <td className="py-2 text-slate-600">{t.material}</td>
                    <td className="py-2 font-semibold text-slate-900">{t.torque.toFixed(1)} N·m</td>
                    <td className="py-2 text-right text-blue-600 font-bold">{t.expStrain.toFixed(1)}</td>
                    <td className="py-2 text-right text-slate-400">{t.theorStrain.toFixed(1)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}