// Runs in the page's own JS world on docs.google.com, at document_start.
// Docs, Sheets and Slides draw the document on <canvas>, so the whole canvas is
// inverted along with the page. That is right for text and cells, but pictures
// drawn on the canvas would come out as negatives. This wraps drawImage so a
// picture is drawn pre-inverted while Dusk's dark mode is on; the page-level
// inversion then turns it back to its real colors.
//
// Only real pictures (<img>, <video>, bitmaps decoded from image files) are touched.
// Canvas-to-canvas copies are left alone: Google uses them for text tiles, and
// pre-inverting those would undo the dark mode for text.
(() => {
  const proto = window.CanvasRenderingContext2D && CanvasRenderingContext2D.prototype;
  if (!proto || proto.__duskWrapped) return;
  Object.defineProperty(proto, "__duskWrapped", { value: true });

  const original = proto.drawImage;
  const UNDO = "invert(1) hue-rotate(180deg)";

  function darkOn() {
    return document.documentElement && document.documentElement.getAttribute("data-dusk") === "dark";
  }

  function isPicture(src) {
    return (
      (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement) ||
      (typeof HTMLVideoElement !== "undefined" && src instanceof HTMLVideoElement) ||
      (typeof SVGImageElement !== "undefined" && src instanceof SVGImageElement) ||
      pictureBitmaps.has(src)
    );
  }

  // Bitmaps made from pictures or image files count as pictures too.
  const pictureBitmaps = new WeakSet();
  if (typeof window.createImageBitmap === "function") {
    const make = window.createImageBitmap;
    window.createImageBitmap = function (src, ...rest) {
      const fromPicture = isPicture(src) || (typeof Blob !== "undefined" && src instanceof Blob);
      const p = make.call(this, src, ...rest);
      if (fromPicture) p.then((bmp) => pictureBitmaps.add(bmp), () => {});
      return p;
    };
  }

  proto.drawImage = function (src, ...rest) {
    if (!darkOn() || !isPicture(src)) {
      return original.call(this, src, ...rest);
    }
    const prev = this.filter;
    try {
      this.filter = prev && prev !== "none" ? `${prev} ${UNDO}` : UNDO;
      return original.call(this, src, ...rest);
    } finally {
      this.filter = prev;
    }
  };

  // Grayscale text on the canvas. Chrome draws LCD (subpixel, ClearType-style) text
  // on opaque canvases. Inverted, those colored fringes swap sides and the text
  // looks blurry and tinted (Sheets does this). A canvas with alpha gets grayscale
  // antialiasing, which inverts cleanly. The setting is read when the canvas is
  // created, so a change applies after a reload. Default is on.
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, options) {
    const off = document.documentElement && document.documentElement.getAttribute("data-dusk-gray-text") === "off";
    if (type === "2d" && !off && options && options.alpha === false) {
      options = Object.assign({}, options, { alpha: true });
    }
    return getContext.call(this, type, options);
  };
})();
