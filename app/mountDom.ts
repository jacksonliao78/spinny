import type { HudElements } from "../render/hudPanels";
import { getElement } from "./dom";

type Canvas2d = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

type HudElementIds = {
  holdCanvas: string;
  nextCanvas: string;
  timerEl: string;
  linesRow: string;
  linesValue: string;
  scoreRow: string;
  scoreValue: string;
  levelRow: string;
  levelValue: string;
  ppsRow: string;
  ppsValue: string;
  comboRow: string;
  comboValue: string;
  survivalRow: string;
  survivalValue: string;
};

const getCanvas2d = (id: string): Canvas2d | null => {
  const canvas = getElement<HTMLCanvasElement>(id);
  const ctx = canvas.getContext("2d");
  return ctx ? { canvas, ctx } : null;
};

const getHudElements = (ids: HudElementIds): HudElements => ({
  holdCanvas: getElement<HTMLCanvasElement>(ids.holdCanvas),
  nextCanvas: getElement<HTMLCanvasElement>(ids.nextCanvas),
  timerEl: getElement<HTMLElement>(ids.timerEl),
  linesRow: getElement<HTMLElement>(ids.linesRow),
  linesValue: getElement<HTMLElement>(ids.linesValue),
  scoreRow: getElement<HTMLElement>(ids.scoreRow),
  scoreValue: getElement<HTMLElement>(ids.scoreValue),
  levelRow: getElement<HTMLElement>(ids.levelRow),
  levelValue: getElement<HTMLElement>(ids.levelValue),
  ppsRow: getElement<HTMLElement>(ids.ppsRow),
  ppsValue: getElement<HTMLElement>(ids.ppsValue),
  comboRow: getElement<HTMLElement>(ids.comboRow),
  comboValue: getElement<HTMLElement>(ids.comboValue),
  survivalRow: getElement<HTMLElement>(ids.survivalRow),
  survivalValue: getElement<HTMLElement>(ids.survivalValue),
});

export { getCanvas2d, getHudElements };
export type { Canvas2d, HudElementIds };
