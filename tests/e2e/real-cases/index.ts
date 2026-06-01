import { p0RealModelScenarios } from './p0';
import { p1RealModelScenarios } from './p1';
import { p2RealModelScenarios } from './p2';

export const realModelScenarios = [
  ...p0RealModelScenarios,
  ...p1RealModelScenarios,
  ...p2RealModelScenarios
];

if (realModelScenarios.length !== 25) {
  throw new Error(`Expected 25 real model scenarios, got ${realModelScenarios.length}`);
}
