const fs = require("fs");
const vm = require("vm");

const referenceIds = new Set([
  "a4-half-width",
  "a4-width",
  "a4-height",
  "id-card-long",
  "id-card-short",
  "rmb-100-long",
  "rmb-50-long",
  "rmb-20-long",
  "rmb-10-long",
  "rmb-5-long",
  "rmb-1-long",
  "coin-1y-2019",
  "coin-1y-old",
  "coin-5jiao",
  "coin-1jiao",
  "custom"
]);

class NodeStub {
  constructor(tagName = "node", isFragment = false) {
    this.tagName = tagName;
    this.isFragment = isFragment;
    this.children = [];
    this.value = "";
    this._textContent = "";
    this.className = "";
    this.disabled = false;
    this.style = {};
    this.events = {};
    this.attributes = {};
    this.classList = {
      values: new Set(),
      add: (name) => this.classList.values.add(name),
      remove: (name) => this.classList.values.delete(name),
      toggle: (name, enabled) => enabled
        ? this.classList.values.add(name)
        : this.classList.values.delete(name)
    };
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = value;
    if (value === "") this.children = [];
  }

  addEventListener(type, handler) {
    this.events[type] = handler;
  }

  append(child) {
    if (child.isFragment) this.children.push(...child.children);
    else this.children.push(child);
  }

  setAttribute(name, value) {
    this.attributes[name] = value;
  }

  querySelector(selector) {
    const match = selector.match(/option\[value="([^"]+)"\]/);
    return match && referenceIds.has(match[1]) ? {} : null;
  }
}

const ids = [
  "referenceType",
  "referenceHint",
  "customLengthWrap",
  "referenceLength",
  "referenceDisplay",
  "calibrationRange",
  "calibrationRuler",
  "rulerEnd",
  "pixelDisplay",
  "saveCalibration",
  "resetCalibration",
  "calibrationState",
  "refreshMeasurements",
  "resultEmpty",
  "resultContent",
  "widthValue",
  "heightValue",
  "diagonalValue",
  "diagonalInches",
  "visualWidth",
  "visualHeight",
  "monitorVisual",
  "resolutionValue",
  "ratioValue",
  "scaleValue",
  "rulerEmpty",
  "screenRulerContent",
  "rulerLengthNumber",
  "rulerLengthRange",
  "rulerLengthDisplay",
  "screenRuler",
  "rulerTicks",
  "rulerHelp"
];

const elements = Object.fromEntries(ids.map((id) => [id, new NodeStub(id)]));
elements.referenceType.value = "a4-half-width";
elements.referenceLength.value = "10";
elements.calibrationRange.value = "324";
elements.rulerLengthNumber.value = "15";
elements.rulerLengthRange.value = "15";

const store = {};
const context = {
  document: {
    querySelector: (selector) => elements[selector.slice(1)],
    createDocumentFragment: () => new NodeStub("fragment", true),
    createElement: (tagName) => new NodeStub(tagName)
  },
  window: {
    screen: { width: 1920, height: 1080 },
    innerWidth: 1920,
    innerHeight: 1080,
    devicePixelRatio: 1,
    addEventListener: () => {}
  },
  localStorage: {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value; },
    removeItem: (key) => { delete store[key]; }
  },
  console
};

vm.createContext(context);
vm.runInContext(fs.readFileSync("script.js", "utf8"), context);

elements.calibrationRange.value = "420";
elements.saveCalibration.events.click();

if (elements.screenRuler.style.width !== "600px") {
  throw new Error(`15 cm ruler width failed: ${elements.screenRuler.style.width}`);
}

if (elements.rulerTicks.children.length !== 151) {
  throw new Error(`15 cm tick count failed: ${elements.rulerTicks.children.length}`);
}

elements.rulerLengthRange.value = "20";
elements.rulerLengthRange.events.input();

if (elements.screenRuler.style.width !== "800px") {
  throw new Error(`20 cm ruler width failed: ${elements.screenRuler.style.width}`);
}

if (elements.rulerTicks.children.length !== 201) {
  throw new Error(`20 cm tick count failed: ${elements.rulerTicks.children.length}`);
}

console.log("Screen ruler test passed: 15 cm and 20 cm lengths render with millimeter ticks.");
