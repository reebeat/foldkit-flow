import { XYDrag, XYHandle, XYMinimap, XYPanZoom } from "@xyflow/system";

// The controller factories the Mounts call. They are a dependency the Flow is given (`defineFlow(options, controllers)`),
// not an import the Mounts hide: the default is the real `@xyflow/system`, and a test passes factories that record what
// was created, so that a Mount's lifetime can be observed without replacing a module.

export interface Controllers {
  readonly XYDrag: typeof XYDrag;
  readonly XYMinimap: typeof XYMinimap;
  readonly XYPanZoom: typeof XYPanZoom;
  /** `XYHandle.onPointerDown`: a connection gesture has no instance to destroy; it ends with a release on the document. */
  readonly onPointerDown: typeof XYHandle.onPointerDown;
}

export const xyflowControllers: Controllers = {
  XYDrag,
  XYMinimap,
  XYPanZoom,
  onPointerDown: XYHandle.onPointerDown,
};
