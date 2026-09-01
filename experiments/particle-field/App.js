export default class ParticleField {
  constructor(container) {
    this.container = container;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.points = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), vx: (Math.random()-.5)*.0007, vy: (Math.random()-.5)*.0007 }));
    this.frame = null;
  }

  start() {
    this.container.appendChild(this.canvas);
    this.canvas.style.width = this.canvas.style.height = '100%';
    const draw = () => {
      const { ctx, canvas } = this;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.fillStyle = '#f3f4f6';
      for (const p of this.points) {
        p.x=(p.x+p.vx+1)%1; p.y=(p.y+p.vy+1)%1;
        ctx.beginPath(); ctx.arc(p.x*canvas.width,p.y*canvas.height,1.5,0,Math.PI*2); ctx.fill();
      }
      this.frame=requestAnimationFrame(draw);
    };
    draw();
  }

  resize(width, height) {
    const dpr=Math.min(devicePixelRatio||1,2);
    this.canvas.width=Math.floor(width*dpr); this.canvas.height=Math.floor(height*dpr);
  }

  destroy() { cancelAnimationFrame(this.frame); }
}
