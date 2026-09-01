export default class Experiment {
  constructor(container) {
    this.container = container;
  }

  start() {
    this.container.innerHTML = '<div style="display:grid;place-items:center;width:100%;height:100%"><h1>New experiment</h1></div>';
  }

  resize(_width, _height) {}
  destroy() {}
}
