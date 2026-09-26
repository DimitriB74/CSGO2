// Test de bout en bout : on lance le serveur, on ouvre le jeu dans un vrai
// navigateur, on joue, et on vérifie que tout répond.
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const PORT = 3210;
const SHOTS = process.env.SHOTS || '/tmp/shots';

const server = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT) } });
let serverLog = '';
server.stdout.on('data', (d) => { serverLog += d; });
server.stderr.on('data', (d) => { serverLog += d; });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = '') => {
  results.push({ label, ok, detail });
  console.log(`  ${ok ? 'OK  ' : 'ÉCHEC'}  ${label}${detail ? '  — ' + detail : ''}`);
};

await wait(1200);

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });

const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

console.log('\n=== 1. Chargement et connexion ===');
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
check('la page se charge', await page.title() === 'Point de Rupture', await page.title());

await page.fill('#nick', 'Testeur');
await page.click('#play');
await page.waitForFunction(() => window.__pdr !== undefined, { timeout: 8000 });
check('connexion WebSocket et initialisation', true);

await wait(1500);
const info = await page.evaluate(() => {
  const p = window.__pdr;
  return {
    id: p.net.init.id, team: p.net.init.team,
    mapName: p.net.init.map.name, boxes: p.net.init.map.geometry.length,
    weapons: Object.keys(p.net.init.weapons).length,
    snapshots: p.net.snapshots.length,
    hudVisible: !document.getElementById('hud').classList.contains('hidden'),
  };
});
check('carte et catalogue reçus', info.mapName === 'Sablier' && info.weapons === 20,
  `${info.mapName}, ${info.boxes} boîtes, ${info.weapons} armes`);
check('instantanés reçus', info.snapshots > 10, `${info.snapshots} en 1,5 s`);
check('ATH affiché', info.hudVisible);
check(`camp attribué`, !!info.team, info.team);

await page.screenshot({ path: `${SHOTS}/01-spawn.png` });

// On attend d'être vivant : un joueur tué par un bot ne peut plus bouger, et le
// test mesurerait alors zéro sans que rien ne soit cassé.
async function waitAlive(label) {
  for (let i = 0; i < 400; i++) {
    const alive = await page.evaluate(() => !!window.__pdr.net.snapshots.at(-1).snap.me.al);
    if (alive) return true;
    await wait(250);
  }
  check(`${label} : joueur vivant`, false, 'toujours mort après 100 s');
  return false;
}

console.log('\n=== 2. Achat validé par le serveur ===');
const buyBefore = await page.evaluate(() => window.__pdr.net.snapshots.at(-1).snap.me.mo);
await page.evaluate(() => window.__pdr.net.send({ t: 'buy', item: 'gilet' }));
await wait(500);
const buyAfter = await page.evaluate(() => {
  const me = window.__pdr.net.snapshots.at(-1).snap.me;
  return { money: me.mo, armor: me.ar, helmet: me.hel };
});
check('achat du gilet accepté', buyAfter.armor === 100 && buyAfter.money === buyBefore - 650,
  `${buyBefore} $ → ${buyAfter.money} $, armure ${buyAfter.armor}`);

const denied = await page.evaluate(async () => {
  return new Promise((resolve) => {
    window.__pdr.net.onBuyResult = (r) => resolve(r);
    window.__pdr.net.send({ t: 'buy', item: 'monolithe' });
  });
});
check('achat refusé si fonds insuffisants', denied.ok === false, denied.reason);

console.log('\n=== 3. Déplacement et prédiction ===');
await waitAlive('déplacement');
// La souris verrouillée n'existe pas en environnement de test : on force l'état
// pour pouvoir piloter le joueur au clavier.
await page.evaluate(() => { window.__pdr.input.locked = true; });
const before = await page.evaluate(() => ({ ...window.__pdr.predictor.state.pos }));

await page.keyboard.down('KeyW');
await wait(1400);
await page.keyboard.up('KeyW');
await wait(200);

const after = await page.evaluate(() => ({
  pos: { ...window.__pdr.predictor.state.pos },
  speed: window.__pdr.predictor.horizontalSpeed,
  error: window.__pdr.predictor.lastError,
}));
const travelled = Math.hypot(after.pos.x - before.x, after.pos.z - before.z);
check('le joueur avance', travelled > 4, `${travelled.toFixed(2)} m parcourus`);
check('erreur de prédiction faible', after.error < 0.35,
  `écart serveur/client ${(after.error * 100).toFixed(1)} cm`);

console.log('\n=== 4. Counter-strafe ===');
await waitAlive('counter-strafe');
await page.keyboard.down('KeyW');
await wait(900);
const atSpeed = await page.evaluate(() => window.__pdr.predictor.horizontalSpeed);
await page.keyboard.up('KeyW');
await page.keyboard.down('KeyS');
const minSpeed = await page.evaluate(async () => {
  let min = 99;
  for (let i = 0; i < 26; i++) {
    await new Promise((r) => setTimeout(r, 5));
    min = Math.min(min, window.__pdr.predictor.horizontalSpeed);
  }
  return min;
});
await page.keyboard.up('KeyS');
const afterCounter = minSpeed;
check('pleine vitesse atteinte', atSpeed > 6, `${atSpeed.toFixed(2)} m/s`);
check('counter-strafe arrête net', afterCounter < 1.2,
  `${atSpeed.toFixed(2)} → ${afterCounter.toFixed(2)} m/s en ~130 ms`);

console.log('\n=== 5. Tir ===');
await waitAlive('tir');
const ammoBefore = await page.evaluate(() => window.__pdr.net.snapshots.at(-1).snap.me.am);
await page.evaluate(() => { window.__pdr.input.mouse.left = true; });
await wait(700);
await page.evaluate(() => { window.__pdr.input.mouse.left = false; });
await wait(400);
const shooting = await page.evaluate(() => {
  const me = window.__pdr.net.snapshots.at(-1).snap.me;
  return { ammo: me.am, spread: me.sp, punch: me.pu };
});
check('les munitions descendent', shooting.ammo < ammoBefore, `${ammoBefore} → ${shooting.ammo}`);
check('le recul déplace la vue', Math.abs(shooting.punch[0]) > 0.2 || shooting.spread > 0.3,
  `tangage ${shooting.punch[0].toFixed(2)}°, cône ${shooting.spread.toFixed(2)}°`);
await page.screenshot({ path: `${SHOTS}/02-tir.png` });

console.log('\n=== 6. Rechargement ===');
await page.keyboard.down('KeyR');
await wait(120);
await page.keyboard.up('KeyR');
await wait(2800);
const reloaded = await page.evaluate(() => window.__pdr.net.snapshots.at(-1).snap.me);
check('le chargeur se remplit', reloaded.am > shooting.ammo, `${shooting.ammo} → ${reloaded.am}`);

console.log('\n=== 7. Bots, round et adversaires visibles ===');
await wait(4000);
const world = await page.evaluate(() => {
  const snap = window.__pdr.net.snapshots.at(-1).snap;
  return {
    players: snap.ps.length + 1,
    alive: snap.ps.filter((p) => p.a).length,
    state: snap.m.state,
    round: snap.m.round,
    scoreboard: snap.sb.length,
    meshes: window.__pdr.scene.playerMeshes.size,
  };
});
check('dix joueurs dans la partie', world.players === 10, `${world.players} joueurs, ${world.alive} vivants`);
check('les silhouettes sont créées', world.meshes >= 5, `${world.meshes} silhouettes`);
check('le match est en cours', ['freeze', 'live', 'end'].includes(world.state),
  `${world.state}, round ${world.round}`);

console.log('\n=== 8. Interface ===');
await page.keyboard.down('Tab');
await wait(300);
const sbRows = await page.evaluate(() => document.querySelectorAll('#sb-body .sb-row').length);
await page.screenshot({ path: `${SHOTS}/03-scores.png` });
await page.keyboard.up('Tab');
check('tableau des scores rempli', sbRows >= 10, `${sbRows} lignes`);

await page.evaluate(() => window.__pdr.hud.toggleBuy(true));
await wait(300);
const buyButtons = await page.evaluate(() => document.querySelectorAll('.buy-item').length);
await page.screenshot({ path: `${SHOTS}/04-achat.png` });
await page.evaluate(() => window.__pdr.hud.toggleBuy(false));
check('menu d\'achat rempli', buyButtons >= 15, `${buyButtons} articles`);

const radarPainted = await page.evaluate(() => {
  const canvas = document.getElementById('radar');
  const data = canvas.getContext('2d').getImageData(0, 0, 200, 200).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 8) painted++;
  return painted;
});
check('le radar dessine la carte', radarPainted > 2000, `${radarPainted} pixels peints`);

console.log('\n=== 9. Le rendu 3D produit une image ===');
const rendered = await page.evaluate(() => {
  const canvas = document.getElementById('view');
  const info = window.__pdr.scene.renderer.info.render;
  return { w: canvas.width, h: canvas.height, triangles: info.triangles, calls: info.calls };
});
await page.screenshot({ path: `${SHOTS}/05-jeu.png` });
check('canvas dimensionné', rendered.w > 1000, `${rendered.w}×${rendered.h}`);
check('la scène est réellement dessinée', rendered.triangles > 300,
  `${rendered.triangles} triangles en ${rendered.calls} appels de rendu`);

console.log('\n=== 10. Aucune erreur console ===');
check('console propre', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
server.kill();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} vérifications passées`);
if (serverLog.includes('Error') || serverLog.includes('error')) {
  console.log('--- journal serveur ---\n' + serverLog);
}
if (failed.length > 0) {
  console.log('Échecs : ' + failed.map((f) => f.label).join(', '));
  process.exit(1);
}
