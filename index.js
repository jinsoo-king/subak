// const Matter = require('matter-js');

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(Date.now());
const LB_KEY = "subak_leaderboard"; // localStorage 키

const {
  Engine,
  Render,
  Runner,
  Composites,
  Common,
  MouseConstraint,
  Mouse,
  Composite,
  Bodies,
  Events,
} = Matter;

const wallPad = 64;
const loseHeight = 84;
const statusBarHeight = 48;
const previewBallHeight = 32;
const friction = {
  friction: 0.006,
  frictionStatic: 0.006,
  frictionAir: 0,
  restitution: 0.1,
};

const GameStates = {
  MENU: 0,
  READY: 1,
  DROP: 2,
  LOSE: 3,
};

const Game = {
  width: 640,
  height: 960,
  elements: {
    canvas: document.getElementById("game-canvas"),
    ui: document.getElementById("game-ui"),
    score: document.getElementById("game-score"),
    end: document.getElementById("game-end-container"),
    endTitle: document.getElementById("game-end-title"),
    statusValue: document.getElementById("game-highscore-value"),
    nextFruitImg: document.getElementById("game-next-fruit"),
    previewBall: null,
  },
  cache: { highscore: 0 },
  sounds: {
    click: new Audio("./assets/click.mp3"),
    pop0: new Audio("./assets/pop0.mp3"),
    pop1: new Audio("./assets/pop1.mp3"),
    pop2: new Audio("./assets/pop2.mp3"),
    pop3: new Audio("./assets/pop3.mp3"),
    pop4: new Audio("./assets/pop4.mp3"),
    pop5: new Audio("./assets/pop5.mp3"),
    pop6: new Audio("./assets/pop6.mp3"),
    pop7: new Audio("./assets/pop7.mp3"),
    pop8: new Audio("./assets/pop8.mp3"),
    pop9: new Audio("./assets/pop9.mp3"),
    pop10: new Audio("./assets/pop10.mp3"),
  },

  stateIndex: GameStates.MENU,
  score: 0,
  fruitsMerged: [],

  calculateScore() {
    const score = this.fruitsMerged.reduce(
      (tot, cnt, idx) => tot + this.fruitSizes[idx].scoreValue * cnt,
      0
    );
    this.score = score;
    this.elements.score.innerText = score;
  },

  fruitSizes: [
    { radius: 24, scoreValue: 1, img: "./assets/img/circle0.png" },
    { radius: 32, scoreValue: 3, img: "./assets/img/circle1.png" },
    { radius: 40, scoreValue: 6, img: "./assets/img/circle2.png" },
    { radius: 56, scoreValue: 10, img: "./assets/img/circle3.png" },
    { radius: 64, scoreValue: 15, img: "./assets/img/circle4.png" },
    { radius: 72, scoreValue: 21, img: "./assets/img/circle5.png" },
    { radius: 84, scoreValue: 28, img: "./assets/img/circle6.png" },
    { radius: 96, scoreValue: 36, img: "./assets/img/circle7.png" },
    { radius: 128, scoreValue: 45, img: "./assets/img/circle8.png" },
    { radius: 160, scoreValue: 55, img: "./assets/img/circle9.png" },
    { radius: 192, scoreValue: 66, img: "./assets/img/circle10.png" },
  ],

  currentFruitSize: 0,
  nextFruitSize: 0,

  setNextFruitSize() {
    this.nextFruitSize = Math.floor(rand() * 5);
    this.elements.nextFruitImg.src = `./assets/img/circle${this.nextFruitSize}.png`;
  },

  showHighscore() {
    this.elements.statusValue.innerText = this.cache.highscore;
  },
  loadHighscore() {
    const raw = localStorage.getItem("suika-game-cache");
    if (!raw) {
      this.saveHighscore();
      return;
    }
    this.cache = JSON.parse(raw);
    this.showHighscore();
  },
  saveHighscore() {
    this.calculateScore();
    if (this.score < this.cache.highscore) return;
    this.cache.highscore = this.score;
    this.showHighscore();
    this.elements.endTitle.innerText = "New Highscore!";
    localStorage.setItem("suika-game-cache", JSON.stringify(this.cache));
  },

  initGame() {
    Render.run(render);
    Runner.run(runner, engine);
    Composite.add(engine.world, menuStatics);
    this.loadHighscore();
    this.elements.ui.style.display = "none";
    this.fruitsMerged = Array(this.fruitSizes.length).fill(0);
    const startHandler = (e) => {
      if (!mouseConstraint.body || mouseConstraint.body.label !== "btn-start")
        return;
      Events.off(mouseConstraint, "mousedown", startHandler);
      this.startGame();
    };
    Events.on(mouseConstraint, "mousedown", startHandler);
  },

  startGame() {
    this.sounds.click.play();
    Composite.remove(engine.world, menuStatics);
    Composite.add(engine.world, gameStatics);
    this.calculateScore();
    this.elements.endTitle.innerText = "Game Over!";
    this.elements.ui.style.display = "block";
    this.elements.end.style.display = "none";
    this.elements.previewBall = this.generateFruitBody(
      this.width / 2,
      previewBallHeight,
      0,
      { isStatic: true }
    );
    Composite.add(engine.world, this.elements.previewBall);
    setTimeout(() => {
      this.stateIndex = GameStates.READY;
    }, 250);
    Events.on(mouseConstraint, "mouseup", (e) =>
      this.addFruit(e.mouse.position.x)
    );
    Events.on(mouseConstraint, "mousemove", (e) => {
      if (this.stateIndex !== GameStates.READY || !this.elements.previewBall)
        return;
      this.elements.previewBall.position.x = e.mouse.position.x;
    });
    Events.on(engine, "collisionStart", (e) => {
      for (let p of e.pairs) {
        const { bodyA, bodyB } = p;
        if (bodyA.isStatic || bodyB.isStatic) continue;
        if (
          bodyA.position.y + bodyA.circleRadius < loseHeight ||
          bodyB.position.y + bodyB.circleRadius < loseHeight
        ) {
          this.loseGame();
          return;
        }
        if (bodyA.sizeIndex !== bodyB.sizeIndex || bodyA.popped || bodyB.popped)
          continue;
        let newSize = bodyA.sizeIndex + 1;
        if (bodyA.circleRadius >= this.fruitSizes.at(-1).radius) newSize = 0;
        this.fruitsMerged[bodyA.sizeIndex]++;
        const midX = (bodyA.position.x + bodyB.position.x) / 2;
        const midY = (bodyA.position.y + bodyB.position.y) / 2;
        bodyA.popped = bodyB.popped = true;
        this.sounds[`pop${bodyA.sizeIndex}`].play();
        Composite.remove(engine.world, [bodyA, bodyB]);
        Composite.add(
          engine.world,
          this.generateFruitBody(midX, midY, newSize)
        );
        this.addPop(midX, midY, bodyA.circleRadius);
        this.calculateScore();
      }
    });
  },

  addPop(x, y, r) {
    const pop = Bodies.circle(x, y, r, {
      isStatic: true,
      collisionFilter: { mask: 0x0040 },
      angle: rand() * Math.PI * 2,
      render: {
        sprite: {
          texture: "./assets/img/pop.png",
          xScale: r / 384,
          yScale: r / 384,
        },
      },
    });
    Composite.add(engine.world, pop);
    setTimeout(() => Composite.remove(engine.world, pop), 100);
  },

  loseGame() {
    this.stateIndex = GameStates.LOSE;
    this.elements.end.style.display = "flex";
    runner.enabled = false;
    this.saveHighscore();
    // 최종 점수 채우고 입력창 포커스
    document.getElementById("final-score").innerText = this.score;
    document.getElementById("player-nickname").focus();
    renderLeaderboard();
  },

  lookupFruitIndex(radius) {
    const idx = this.fruitSizes.findIndex((s) => s.radius === radius);
    return idx < 0 || idx === this.fruitSizes.length - 1 ? null : idx;
  },

  generateFruitBody(x, y, sizeIndex, extra = {}) {
    const size = this.fruitSizes[sizeIndex];
    const c = Bodies.circle(x, y, size.radius, {
      ...friction,
      ...extra,
      render: {
        sprite: {
          texture: size.img,
          xScale: size.radius / 512,
          yScale: size.radius / 512,
        },
      },
    });
    c.sizeIndex = sizeIndex;
    c.popped = false;
    return c;
  },

  addFruit(x) {
    if (this.stateIndex !== GameStates.READY) return;
    this.sounds.click.play();
    this.stateIndex = GameStates.DROP;
    const f = this.generateFruitBody(
      x,
      previewBallHeight,
      this.currentFruitSize
    );
    Composite.add(engine.world, f);
    this.currentFruitSize = this.nextFruitSize;
    this.setNextFruitSize();
    this.calculateScore();
    Composite.remove(engine.world, this.elements.previewBall);
    this.elements.previewBall = this.generateFruitBody(
      render.mouse.position.x,
      previewBallHeight,
      this.currentFruitSize,
      {
        isStatic: true,
        collisionFilter: { mask: 0x0040 },
      }
    );
    setTimeout(() => {
      if (this.stateIndex === GameStates.DROP) {
        Composite.add(engine.world, this.elements.previewBall);
        this.stateIndex = GameStates.READY;
      }
    }, 500);
  },
};

const engine = Engine.create();
const runner = Runner.create();
const render = Render.create({
  element: Game.elements.canvas,
  engine,
  options: {
    width: Game.width,
    height: Game.height,
    wireframes: false,
    background: "#ffdcae",
  },
});

const menuStatics = [
  Bodies.rectangle(Game.width / 2, Game.height * 0.4, 512, 512, {
    isStatic: true,
    render: { sprite: { texture: "./assets/img/bg-menu.png" } },
  }),
  ...Array(Game.fruitSizes.length)
    .fill()
    .map((_, i) => {
      const x = Game.width / 2 + 192 * Math.cos((2 * Math.PI * i) / 12);
      const y = Game.height * 0.4 + 192 * Math.sin((2 * Math.PI * i) / 12);
      const r = 64;
      return Bodies.circle(x, y, r, {
        isStatic: true,
        render: {
          sprite: {
            texture: `./assets/img/circle${i}.png`,
            xScale: r / 1024,
            yScale: r / 1024,
          },
        },
      });
    }),
  Bodies.rectangle(Game.width / 2, Game.height * 0.75, 512, 96, {
    isStatic: true,
    label: "btn-start",
    render: { sprite: { texture: "./assets/img/btn-start.png" } },
  }),
];

const wallProps = {
  isStatic: true,
  render: { fillStyle: "#FFEEDB" },
  ...friction,
};
const gameStatics = [
  Bodies.rectangle(
    -wallPad / 2,
    Game.height / 2,
    wallPad,
    Game.height,
    wallProps
  ),
  Bodies.rectangle(
    Game.width + wallPad / 2,
    Game.height / 2,
    wallPad,
    Game.height,
    wallProps
  ),
  Bodies.rectangle(
    Game.width / 2,
    Game.height + wallPad / 2 - statusBarHeight,
    Game.width,
    wallPad,
    wallProps
  ),
];

const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse,
  constraint: { stiffness: 0.2, render: { visible: false } },
});
render.mouse = mouse;

Game.initGame();

const resizeCanvas = () => {
  const sw = document.body.clientWidth,
    sh = document.body.clientHeight;
  let w = Game.width,
    h = Game.height,
    s = 1;
  if (sw * 1.5 > sh) {
    h = Math.min(Game.height, sh);
    w = h / 1.5;
    s = h / Game.height;
  } else {
    w = Math.min(Game.width, sw);
    h = w * 1.5;
    s = w / Game.width;
  }
  render.canvas.style.width = `${w}px`;
  render.canvas.style.height = `${h}px`;
  Game.elements.ui.style.width = `${Game.width}px`;
  Game.elements.ui.style.height = `${Game.height}px`;
  Game.elements.ui.style.transform = `scale(${s})`;
};
document.body.onload = resizeCanvas;
document.body.onresize = resizeCanvas;

// — 리더보드 기능 —
function loadLeaderboard() {
  const raw = localStorage.getItem(LB_KEY);
  return raw ? JSON.parse(raw) : [];
}
function saveScoreToStorage(name, score, date) {
  const b = loadLeaderboard();
  b.push({ name, score, date });
  b.sort((a, b) => b.score - a.score);
  localStorage.setItem(LB_KEY, JSON.stringify(b.slice(0, 10)));
}
function renderLeaderboard() {
  const el = document.getElementById("leaderboard-list");
  el.innerHTML = "";
  loadLeaderboard().forEach((ent) => {
    const li = document.createElement("li");
    li.innerText = `${ent.name} — ${ent.score}점 (${ent.date})`;
    el.appendChild(li);
  });
}
window.addEventListener("load", renderLeaderboard);
document.getElementById("save-score-btn").addEventListener("click", () => {
  const name =
    document.getElementById("player-nickname").value.trim() || "익명";
  const score = Game.score;
  const date = new Date().toLocaleString();
  saveScoreToStorage(name, score, date);
  renderLeaderboard();
  alert(`${name}님, ${score}점 저장되었습니다!`);
});
