// =============================================================================
//  Rendu 3D.
//
//  La géométrie affichée est **celle que le serveur envoie** : impossible que le
//  décor et les collisions divergent, puisqu'il n'y a qu'une seule description.
//
//  Esthétique volontairement « greybox » : des volumes lisibles, un éclairage
//  franc. Ça se remplace plus tard sans toucher au reste du jeu.
// =============================================================================

import * as THREE from '/vendor/three.module.min.js';
import { TEAM, TEAM_COLOR } from '/shared/constants.js';

const COLORS = {
  floor: 0xb9a37a,
  wall: 0x9a8f7e,
  crate: 0x7c5a35,
};

export class Scene3D {
  constructor(canvas, map) {
    this.canvas = canvas;
    this.map = map;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x8fa5b8);
    this.scene.fog = new THREE.Fog(0x8fa5b8, 70, 150);

    this.camera = new THREE.PerspectiveCamera(90, 1, 0.02, 400);
    this.baseFov = 90;

    this.buildLights();
    this.buildMap();

    this.playerMeshes = new Map();
    this.pickupMeshes = new Map();
    this.effects = [];
    this.buildPools();
    this.buildBomb();

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  buildLights() {
    // Un hémisphérique pour le volume général, un directionnel pour les ombres
    // portées : deux sources suffisent à rendre les volumes lisibles.
    this.scene.add(new THREE.HemisphereLight(0xcfe0ee, 0x6b5f4a, 0.85));

    const sun = new THREE.DirectionalLight(0xffeccf, 1.15);
    sun.position.set(34, 52, -22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const d = 52;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun);
  }

  buildMap() {
    const group = new THREE.Group();

    for (const box of this.map.geometry) {
      const size = {
        x: box.max.x - box.min.x,
        y: box.max.y - box.min.y,
        z: box.max.z - box.min.z,
      };
      const geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
      const material = new THREE.MeshLambertMaterial({ color: COLORS[box.kind] ?? 0x888888 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(
        (box.min.x + box.max.x) / 2,
        (box.min.y + box.max.y) / 2,
        (box.min.z + box.max.z) / 2,
      );
      mesh.receiveShadow = true;
      if (box.kind !== 'floor') mesh.castShadow = true;
      group.add(mesh);
    }

    // Marquage des sites de bombe, à même le sol.
    for (const [name, zone] of Object.entries(this.map.sites)) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.x2 - zone.x1, zone.z2 - zone.z1),
        new THREE.MeshBasicMaterial({ color: 0xd44a2e, transparent: true, opacity: 0.16, depthWrite: false }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((zone.x1 + zone.x2) / 2, 0.02, (zone.z1 + zone.z2) / 2);
      group.add(plane);
      this.siteLabel(group, name, (zone.x1 + zone.x2) / 2, (zone.z1 + zone.z2) / 2);
    }

    // Zones d'achat, en teinte du camp.
    for (const [team, zone] of Object.entries(this.map.buyZones)) {
      const plane = new THREE.Mesh(
        new THREE.PlaneGeometry(zone.x2 - zone.x1, zone.z2 - zone.z1),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(TEAM_COLOR[team]),
          transparent: true, opacity: 0.12, depthWrite: false,
        }),
      );
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((zone.x1 + zone.x2) / 2, 0.02, (zone.z1 + zone.z2) / 2);
      group.add(plane);
    }

    this.scene.add(group);
  }

  /** Grande lettre A ou B peinte au sol, pour se repérer sans radar. */
  siteLabel(group, letter, x, z) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(212,74,46,0.85)';
    ctx.font = 'bold 110px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, 64, 70);

    const texture = new THREE.CanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 5),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(x, 0.04, z);
    group.add(plane);
  }

  buildPools() {
    // Traçantes : des segments réutilisés, jamais réalloués en pleine action.
    this.tracers = [];
    for (let i = 0; i < 64; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }),
      );
      line.frustumCulled = false;
      this.scene.add(line);
      this.tracers.push({ line, life: 0 });
    }

    this.sparks = [];
    const sparkGeometry = new THREE.PlaneGeometry(0.16, 0.16);
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(
        sparkGeometry,
        new THREE.MeshBasicMaterial({ color: 0xffd08a, transparent: true, opacity: 0, depthWrite: false }),
      );
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, life: 0, scale: 1 });
    }

    this.flash = new THREE.PointLight(0xffd79a, 0, 9);
    this.scene.add(this.flash);
    this.flashLife = 0;
  }

  buildBomb() {
    this.bombMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.2, 0.24),
      new THREE.MeshLambertMaterial({ color: 0x2c2f35 }),
    );
    this.bombMesh.visible = false;
    this.bombMesh.castShadow = true;
    this.scene.add(this.bombMesh);

    this.bombLight = new THREE.PointLight(0xff3b2a, 0, 7);
    this.bombLight.visible = false;
    this.scene.add(this.bombLight);
  }

  resize() {
    const width = innerWidth;
    const height = innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setCamera(eye, yaw, pitch, fov) {
    this.camera.position.set(eye.x, eye.y, eye.z);
    // Ordre YXZ : le lacet d'abord, puis le tangage. Sinon la vue roule.
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = (yaw * Math.PI) / 180 + Math.PI;
    this.camera.rotation.x = (-pitch * Math.PI) / 180;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Crée ou met à jour la silhouette d'un joueur. */
  makePlayer(team) {
    const group = new THREE.Group();
    const color = new THREE.Color(TEAM_COLOR[team] ?? '#999999');

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.62, 1.0, 0.42),
      new THREE.MeshLambertMaterial({ color }),
    );
    body.position.y = 0.98;
    body.castShadow = true;
    group.add(body);

    const legs = new THREE.Mesh(
      new THREE.BoxGeometry(0.46, 0.8, 0.34),
      new THREE.MeshLambertMaterial({ color: 0x4a4a4f }),
    );
    legs.position.y = 0.4;
    legs.castShadow = true;
    group.add(legs);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 0.28),
      new THREE.MeshLambertMaterial({ color: 0xd8b195 }),
    );
    head.position.y = 1.66;
    head.castShadow = true;
    group.add(head);

    // Bandeau frontal de la couleur du camp : on identifie l'adversaire de face.
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.07, 0.04),
      new THREE.MeshBasicMaterial({ color }),
    );
    visor.position.set(0, 1.68, 0.15);
    group.add(visor);

    const gun = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.1, 0.7),
      new THREE.MeshLambertMaterial({ color: 0x24262b }),
    );
    gun.position.set(0.22, 1.18, 0.3);
    gun.castShadow = true;
    group.add(gun);

    this.scene.add(group);
    return { group, body, head, legs };
  }

  updatePlayers(players) {
    const seen = new Set();

    for (const player of players) {
      seen.add(player.id);
      let entry = this.playerMeshes.get(player.id);
      if (!entry || entry.team !== player.team) {
        if (entry) this.scene.remove(entry.parts.group);
        entry = { parts: this.makePlayer(player.team), team: player.team };
        this.playerMeshes.set(player.id, entry);
      }

      const group = entry.parts.group;
      group.visible = player.alive;
      if (!player.alive) continue;

      group.position.set(player.pos.x, player.pos.y, player.pos.z);
      group.rotation.y = (player.yaw * Math.PI) / 180 + Math.PI;
      // S'accroupir écrase réellement la silhouette : c'est aussi la hitbox.
      const squash = 1 - player.crouch * 0.27;
      group.scale.set(1, squash, 1);
    }

    for (const [id, entry] of this.playerMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(entry.parts.group);
      this.playerMeshes.delete(id);
    }
  }

  updatePickups(pickups) {
    const seen = new Set();
    for (const pickup of pickups) {
      seen.add(pickup.i);
      let mesh = this.pickupMeshes.get(pickup.i);
      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(pickup.b ? 0.34 : 0.1, pickup.b ? 0.2 : 0.1, pickup.b ? 0.24 : 0.68),
          new THREE.MeshLambertMaterial({ color: pickup.b ? 0xd44a2e : 0x2a2d33 }),
        );
        mesh.castShadow = true;
        this.scene.add(mesh);
        this.pickupMeshes.set(pickup.i, mesh);
      }
      mesh.position.set(pickup.p[0], pickup.p[1] + 0.05, pickup.p[2]);
      mesh.rotation.y += 0.01;
    }
    for (const [id, mesh] of this.pickupMeshes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.pickupMeshes.delete(id);
    }
  }

  setBomb(bomb) {
    const visible = !!(bomb && bomb.planted);
    this.bombMesh.visible = visible;
    this.bombLight.visible = visible;
    if (!visible) return;

    this.bombMesh.position.set(bomb.pos.x, bomb.pos.y + 0.1, bomb.pos.z);
    this.bombLight.position.set(bomb.pos.x, bomb.pos.y + 0.4, bomb.pos.z);
    // Le clignotement s'accélère quand le temps presse : une information de jeu,
    // pas une décoration.
    const urgency = 1 - Math.min(1, bomb.timer / 40);
    const rate = 1.6 + urgency * 9;
    this.bombLight.intensity = (Math.sin(performance.now() / 1000 * rate * Math.PI * 2) > 0 ? 1 : 0) * 2.4;
  }

  tracer(from, to) {
    const slot = this.tracers.find((t) => t.life <= 0) ?? this.tracers[0];
    const positions = slot.line.geometry.attributes.position;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    slot.life = 0.07;
    slot.line.material.opacity = 0.9;
  }

  spark(pos, color = 0xffd08a, scale = 1) {
    const slot = this.sparks.find((s) => s.life <= 0) ?? this.sparks[0];
    slot.mesh.position.set(pos.x, pos.y, pos.z);
    slot.mesh.material.color.setHex(color);
    slot.mesh.material.opacity = 0.95;
    slot.mesh.scale.setScalar(scale);
    slot.mesh.visible = true;
    slot.life = 0.18;
    slot.scale = scale;
  }

  muzzle(pos) {
    this.flash.position.set(pos.x, pos.y, pos.z);
    this.flash.intensity = 4.5;
    this.flashLife = 0.05;
  }

  explosion(pos) {
    for (let i = 0; i < 18; i++) {
      this.spark(
        { x: pos.x + (Math.random() - 0.5) * 6, y: pos.y + Math.random() * 4, z: pos.z + (Math.random() - 0.5) * 6 },
        0xff8a3c,
        3 + Math.random() * 4,
      );
    }
    this.flash.position.set(pos.x, pos.y + 1, pos.z);
    this.flash.intensity = 26;
    this.flashLife = 0.45;
  }

  /** Projette un point du monde en coordonnées écran, ou null s'il est derrière. */
  project(pos) {
    const vector = new THREE.Vector3(pos.x, pos.y, pos.z).project(this.camera);
    if (vector.z > 1) return null;
    return {
      x: (vector.x * 0.5 + 0.5) * innerWidth,
      y: (-vector.y * 0.5 + 0.5) * innerHeight,
    };
  }

  render(dt) {
    for (const slot of this.tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / 0.07) * 0.9;
    }
    for (const slot of this.sparks) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const t = Math.max(0, slot.life / 0.18);
      slot.mesh.material.opacity = t;
      slot.mesh.scale.setScalar(slot.scale * (1 + (1 - t) * 1.6));
      slot.mesh.quaternion.copy(this.camera.quaternion);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    if (this.flashLife > 0) {
      this.flashLife -= dt;
      this.flash.intensity = Math.max(0, this.flash.intensity - dt * 90);
      if (this.flashLife <= 0) this.flash.intensity = 0;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
