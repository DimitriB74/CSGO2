// =============================================================================
//  Interface : vitalité, munitions, chronomètre, killfeed, radar, menu d'achat,
//  tableau des scores.
//
//  Tout est en DOM plutôt qu'en 3D : c'est net à toutes les résolutions, ça se
//  restyle en CSS, et ça ne coûte rien au rendu de la scène.
// =============================================================================

import { TEAM, TEAM_COLOR, TEAM_LABEL } from '/shared/constants.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(init, onBuy) {
    this.init = init;
    this.onBuy = onBuy;
    this.myId = init.id;
    this.myTeam = init.team;
    this.buyItems = [];
    this.buyOpen = false;
    this.announceTimer = 0;

    this.radar = $('radar');
    this.radarCtx = this.radar.getContext('2d');
    this.radarScale = 190 / 74;

    this.buildBuyGrid();
    $('buy-grid').addEventListener('click', (event) => {
      const button = event.target.closest('.buy-item');
      if (button) this.onBuy(button.dataset.item);
    });
  }

  setTeam(team) {
    if (team === this.myTeam) return;
    this.myTeam = team;
    this.buildBuyGrid();
  }

  // ---------------------------------------------------------------------------
  //  Menu d'achat
  // ---------------------------------------------------------------------------

  buildBuyGrid() {
    const weapons = Object.values(this.init.weapons)
      .filter((w) => w.price > 0 && (!w.team || w.team === this.myTeam));
    const gear = this.init.gear.filter((g) => !g.team || g.team === this.myTeam);

    const order = { pistol: 0, shotgun: 1, smg: 2, rifle: 3, sniper: 4, mg: 5 };
    weapons.sort((a, b) => (order[a.category] - order[b.category]) || (a.price - b.price));

    const label = {
      pistol: 'Pistolet', shotgun: 'Pompe', smg: 'PM',
      rifle: 'Fusil', sniper: 'Précision', mg: 'Mitrailleuse',
    };

    this.buyItems = [
      ...gear.map((g) => ({ id: g.id, name: g.name, price: g.price, cat: 'Équipement' })),
      ...weapons.map((w) => ({ id: w.id, name: w.name, price: w.price, cat: label[w.category] ?? '' })),
    ];

    $('buy-grid').innerHTML = this.buyItems
      .map((item, index) => `
        <button class="buy-item" data-item="${item.id}" data-price="${item.price}">
          <span class="k">${index < 9 ? index + 1 : ''}</span>
          <span class="n">${item.name}<span class="c">${item.cat}</span></span>
          <span class="p">$${item.price}</span>
        </button>`)
      .join('');
  }

  toggleBuy(force) {
    this.buyOpen = force === undefined ? !this.buyOpen : force;
    $('buy').classList.toggle('hidden', !this.buyOpen);
    if (!this.buyOpen) $('buy-warning').textContent = '';
    return this.buyOpen;
  }

  quickBuy(index) {
    const item = this.buyItems[index];
    if (item) this.onBuy(item.id);
  }

  buyResult(result) {
    $('buy-warning').textContent = result.ok ? `Acheté : ${result.item}` : result.reason;
    $('buy-warning').style.color = result.ok ? '#7ddb92' : '#ff8b4a';
  }

  toggleScoreboard(show) {
    $('scoreboard').classList.toggle('hidden', !show);
  }

  // ---------------------------------------------------------------------------
  //  Mise à jour par image
  // ---------------------------------------------------------------------------

  update(snap, spreadPixels, dt) {
    const me = snap.me;
    const match = snap.m;

    $('health').textContent = me.hp;
    $('armor').textContent = me.ar + (me.hel ? ' ⛑' : '');
    $('money').textContent = `$${me.mo}`;

    const weapon = me.w ? this.init.weapons[me.w] : null;
    $('weapon-name').textContent = weapon ? weapon.name : '—';
    $('mag').textContent = me.am;
    $('reserve').textContent = `/ ${me.res}`;
    $('ammo').classList.toggle('low', weapon && me.am <= Math.max(1, weapon.magazine * 0.25));

    const slotName = { primary: 'Principale', secondary: 'Secondaire', melee: 'Couteau' };
    $('slots').innerHTML = ['primary', 'secondary', 'melee']
      .map((slot, i) => (slot === me.sl ? `<b>${i + 1} ${slotName[slot]}</b>` : `${i + 1} ${slotName[slot]}`))
      .join(' · ');

    // Chronomètre : celui de la bombe remplace celui du round dès la pose.
    const bombPlanted = match.bomb && match.bomb.planted;
    const seconds = bombPlanted ? match.bomb.timer : match.timer;
    const mm = Math.floor(seconds / 60);
    const ss = Math.floor(seconds % 60);
    $('timer').textContent = `${mm}:${String(ss).padStart(2, '0')}`;
    $('timer').classList.toggle('urgent', bombPlanted || seconds < 20);

    $('score-cendre').textContent = match.scores[TEAM.CENDRE];
    $('score-verrou').textContent = match.scores[TEAM.VERROU];

    const phase = {
      warmup: 'Échauffement', freeze: "Temps d'achat", live: `Round ${match.round}`,
      end: 'Fin du round', over: 'Match terminé',
    }[match.state] ?? '';
    $('phase').textContent = match.buyOpen ? `${phase} — achat ouvert (B)` : phase;

    $('bombstate').textContent = bombPlanted
      ? `CHARGE ARMÉE — SITE ${match.bomb.site}${match.bomb.defuse > 0 ? ` — désamorçage ${Math.round(match.bomb.defuse * 100)} %` : ''}`
      : me.bomb ? 'Tu portes la charge — E pour poser sur un site' : '';

    const action = $('action');
    if (me.act > 0 && me.lbl) {
      action.classList.add('show');
      $('action-label').textContent = me.lbl;
      $('action-bar').firstElementChild.style.width = `${Math.min(100, me.act * 100)}%`;
    } else {
      action.classList.remove('show');
    }

    $('deadnotice').classList.toggle('hidden', !!me.al);
    $('scope').classList.toggle('hidden', !me.sc);

    // Viseur dynamique : l'écart reflète le cône de dispersion réel. On voit
    // donc directement l'effet du mouvement et du recul sur sa précision.
    const gap = Math.max(3, Math.min(90, spreadPixels));
    $('crosshair').querySelector('.ch-t').style.cssText = `top:${-gap - 7}px`;
    $('crosshair').querySelector('.ch-b').style.cssText = `top:${gap}px`;
    $('crosshair').querySelector('.ch-l').style.cssText = `left:${-gap - 7}px`;
    $('crosshair').querySelector('.ch-r').style.cssText = `left:${gap}px`;

    if (this.buyOpen) $('buy-money').textContent = `$${me.mo}`;
    if (this.buyOpen) {
      for (const button of $('buy-grid').children) {
        button.classList.toggle('poor', Number(button.dataset.price) > me.mo);
      }
    }

    if (this.announceTimer > 0) {
      this.announceTimer -= dt;
      if (this.announceTimer <= 0) $('announce').classList.remove('show');
    }

    this.drawRadar(snap);
    this.drawScoreboard(snap);
  }

  // ---------------------------------------------------------------------------
  //  Événements
  // ---------------------------------------------------------------------------

  handleEvents(events, myId) {
    for (const event of events) {
      switch (event.type) {
        case 'kill':
          this.pushKill(event);
          break;
        case 'announce':
          this.announce(event.text);
          break;
        case 'roundEnd':
          this.announce(`${TEAM_LABEL[event.winner]} — ${event.reason}`);
          break;
        case 'hit':
          if (event.attacker === myId) this.hitMarker(event.zone === 'head');
          if (event.victim === myId) this.damageFlash();
          break;
      }
    }
  }

  pushKill(event) {
    const feed = $('killfeed');
    const line = document.createElement('div');
    const killerColor = event.killerTeam ? TEAM_COLOR[event.killerTeam] : '#9aa3ad';
    line.innerHTML =
      `<span style="color:${killerColor}">${escapeHtml(event.killer)}</span>` +
      ` <span style="color:#8d96a0">${escapeHtml(event.weapon)}</span>` +
      (event.headshot ? ' <span class="hs">✖</span>' : '') +
      ` <span style="color:${TEAM_COLOR[event.victimTeam] ?? '#9aa3ad'}">${escapeHtml(event.victim)}</span>`;
    feed.prepend(line);
    while (feed.children.length > 6) feed.lastElementChild.remove();
    setTimeout(() => line.remove(), 7000);
  }

  announce(text) {
    const node = $('announce');
    node.textContent = text;
    node.classList.add('show');
    this.announceTimer = 3;
  }

  hitMarker(headshot) {
    const marker = $('hitmarker');
    marker.classList.remove('show');
    marker.classList.toggle('head', headshot);
    // Forcer un reflow relance l'animation même sur deux touches rapprochées.
    void marker.offsetWidth;
    marker.classList.add('show');
  }

  damageFlash() {
    const flash = $('damage-flash');
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 60);
  }

  // ---------------------------------------------------------------------------
  //  Radar
  // ---------------------------------------------------------------------------

  drawRadar(snap) {
    const ctx = this.radarCtx;
    const me = snap.me;
    const yaw = (this.viewYaw ?? 0) * Math.PI / 180;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const s = this.radarScale;

    // Le radar tourne avec le joueur : ce qu'on a devant soi est vers le haut.
    const toScreen = (x, z) => {
      const dx = x - me.p[0];
      const dz = z - me.p[2];
      return [100 + (dx * cos - dz * sin) * s, 100 - (dx * sin + dz * cos) * s];
    };

    ctx.clearRect(0, 0, 200, 200);
    ctx.save();
    ctx.beginPath();
    ctx.arc(100, 100, 95, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = 'rgba(185,163,122,0.20)';
    for (const box of this.init.map.geometry) {
      if (box.kind === 'floor') continue;
      ctx.beginPath();
      const corners = [
        toScreen(box.min.x, box.min.z), toScreen(box.max.x, box.min.z),
        toScreen(box.max.x, box.max.z), toScreen(box.min.x, box.max.z),
      ];
      ctx.moveTo(corners[0][0], corners[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(corners[i][0], corners[i][1]);
      ctx.closePath();
      ctx.fill();
    }

    // Sites de bombe
    ctx.strokeStyle = 'rgba(212,74,46,0.75)';
    ctx.lineWidth = 1.4;
    for (const [name, zone] of Object.entries(this.init.map.sites)) {
      ctx.beginPath();
      const c = [
        toScreen(zone.x1, zone.z1), toScreen(zone.x2, zone.z1),
        toScreen(zone.x2, zone.z2), toScreen(zone.x1, zone.z2),
      ];
      ctx.moveTo(c[0][0], c[0][1]);
      for (let i = 1; i < 4; i++) ctx.lineTo(c[i][0], c[i][1]);
      ctx.closePath();
      ctx.stroke();
      const center = toScreen((zone.x1 + zone.x2) / 2, (zone.z1 + zone.z2) / 2);
      ctx.fillStyle = 'rgba(212,74,46,0.9)';
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(name, center[0], center[1] + 4);
    }

    // Coéquipiers seulement : on ne révèle pas les adversaires.
    for (const other of snap.ps) {
      if (!other.a || other.t !== this.myTeam) continue;
      const [x, y] = toScreen(other.p[0], other.p[2]);
      ctx.fillStyle = TEAM_COLOR[other.t];
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();
      if (other.b) {
        ctx.strokeStyle = '#d44a2e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Charge posée
    const bomb = snap.m.bomb;
    if (bomb && bomb.planted) {
      const [x, y] = toScreen(bomb.pos.x, bomb.pos.z);
      ctx.fillStyle = performance.now() % 600 < 300 ? '#ff3b2a' : '#7a1c12';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Soi-même, toujours au centre, pointant vers le haut.
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(100, 93);
    ctx.lineTo(95, 103);
    ctx.lineTo(105, 103);
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  //  Étiquettes de nom et tableau
  // ---------------------------------------------------------------------------

  drawNametags(players, project) {
    const container = $('nametags');
    const parts = [];
    for (const player of players) {
      if (!player.alive || player.team !== this.myTeam) continue;
      const screen = project({ x: player.pos.x, y: player.pos.y + 2.0, z: player.pos.z });
      if (!screen) continue;
      parts.push(
        `<span style="left:${screen.x.toFixed(0)}px;top:${screen.y.toFixed(0)}px;color:${TEAM_COLOR[player.team]}">` +
        `${escapeHtml(player.name)} <small style="opacity:.7">${player.hp}</small></span>`,
      );
    }
    container.innerHTML = parts.join('');
  }

  drawScoreboard(snap) {
    if ($('scoreboard').classList.contains('hidden')) return;

    const byTeam = { [TEAM.CENDRE]: [], [TEAM.VERROU]: [] };
    for (const row of snap.sb) if (byTeam[row.t]) byTeam[row.t].push(row);

    $('sb-body').innerHTML = [TEAM.CENDRE, TEAM.VERROU].map((team) => `
      <div class="sb-team">
        <h3 style="color:${TEAM_COLOR[team]}">${TEAM_LABEL[team]} — ${snap.m.scores[team]}</h3>
        <div class="sb-row head"><span>Joueur</span><span>K</span><span>M</span><span>Argent</span><span>Ping</span></div>
        ${byTeam[team].map((row) => `
          <div class="sb-row${row.i === this.myId ? ' me' : ''}">
            <span>${escapeHtml(row.n)}${row.bot ? ' <i class="bot">bot</i>' : ''}</span>
            <span>${row.k}</span><span>${row.d}</span>
            <span>$${row.mo}</span><span>${row.bot ? '—' : row.ping}</span>
          </div>`).join('')}
      </div>`).join('');
  }
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
