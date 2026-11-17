import {
  BoxDimensions,
  PalletConfig,
  PalletPatternEvaluation,
  PerfectionistTuningReport,
} from '../types';
import {
  computePerfectionistTuningReport,
  computeSmartPalletAdvisor,
  evaluateAllPalletPatterns,
  PalletPhysicsContext,
} from '../utils/palletizer';

export type SmartPalletAdvisorResult = ReturnType<typeof computeSmartPalletAdvisor>;

export interface PalletizerWorkerRequest {
  requestId: number;
  pallet: PalletConfig;
  outerDims: BoxDimensions;
  innerDims: BoxDimensions;
  grossBoxWeightKg: number;
  correctedBctKgf: number;
  safetyFactor: number;
  unitsPerCase: number;
  physicsCtx: PalletPhysicsContext;
}

export interface PalletizerWorkerResponse {
  requestId: number;
  patternEvaluations: PalletPatternEvaluation[];
  smartAdvisor: SmartPalletAdvisorResult;
  tuningReport: PerfectionistTuningReport;
}

self.onmessage = (event: MessageEvent<PalletizerWorkerRequest>) => {
  const {
    requestId,
    pallet,
    outerDims,
    innerDims,
    grossBoxWeightKg,
    correctedBctKgf,
    safetyFactor,
    unitsPerCase,
    physicsCtx,
  } = event.data;

  const patternEvaluations = evaluateAllPalletPatterns(
    pallet,
    outerDims,
    grossBoxWeightKg,
    correctedBctKgf,
    safetyFactor,
    unitsPerCase,
    physicsCtx
  );

  const smartAdvisor = computeSmartPalletAdvisor(
    pallet,
    outerDims,
    grossBoxWeightKg,
    correctedBctKgf,
    safetyFactor,
    unitsPerCase,
    physicsCtx
  );

  const tuningReport = computePerfectionistTuningReport(
    innerDims,
    pallet,
    grossBoxWeightKg,
    correctedBctKgf,
    safetyFactor,
    unitsPerCase,
    physicsCtx
  );

  const response: PalletizerWorkerResponse = {
    requestId,
    patternEvaluations,
    smartAdvisor,
    tuningReport,
  };

  self.postMessage(response);
};
