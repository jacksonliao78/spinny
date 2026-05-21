type SummaryStat = {
  label: string;
  value: string;
};

const setGarbageMeter = (meter: HTMLElement, valueEl: HTMLElement, amount: number): void => {
  const safeAmount = Math.max(0, Math.floor(amount));
  const level = Math.min(5, Math.ceil(safeAmount / 4));
  meter.dataset.level = String(level);
  valueEl.textContent = safeAmount > 20 ? "20+" : String(safeAmount);
};

const createStatPair = (stat: SummaryStat): [HTMLElement, HTMLElement] => {
  const label = document.createElement("dt");
  const value = document.createElement("dd");
  label.textContent = stat.label;
  value.textContent = stat.value;
  return [label, value];
};

const renderSummaryStatGrid = (container: HTMLElement, stats: SummaryStat[]): void => {
  container.replaceChildren(
    ...stats.map((stat) => {
      const item = document.createElement("div");
      item.append(...createStatPair(stat));
      return item;
    }),
  );
};

const renderDefinitionStats = (container: HTMLElement, stats: SummaryStat[]): void => {
  container.replaceChildren(...stats.flatMap((stat) => createStatPair(stat)));
};

export { renderDefinitionStats, renderSummaryStatGrid, setGarbageMeter };
export type { SummaryStat };
