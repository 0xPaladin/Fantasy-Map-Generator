export type BurgGroup = {
  name: string;
  order: number;
  active?: boolean;
  isDefault?: boolean;
  removed?: boolean;
  min?: number;
  max?: number;
  percentile?: number;
  features?: Record<string, boolean>;
  biomes?: number[];
  states?: number[];
  cultures?: number[];
  religions?: number[];
  preview?: string;
  /** the zoom scale a group becomes visible at; unset means visible at every scale */
  zoomThreshold?: number;
};
