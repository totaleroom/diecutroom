# DieCut.Room — Auto-Generated Codebase Index (Credit-Saver Map)

> **Do not edit manually.** Regenerate anytime with `npm run index:build` (`node scripts/generate-codebase-index.ts`, zero dependencies).
> AI Agents: Read this index FIRST to jump directly to target line ranges without scanning multi-thousand-line files.

- **Indexed Files**: 40 TypeScript/TSX modules (39,435 total lines)
- **Backend API Endpoints**: 43 routes in `server.ts`
- **SQLite Tables**: 5 tables (`users` L65, `bct_history` L83, `saved_projects` L92, `system_meta` L106, `audit_logs` L112)

---

## 1. Module & Export Map

| File | Lines | Key Exports |
| :--- | ---: | :--- |
| `server.ts` | 4369 | *(entry / side-effect)* |
| `scripts/admin-reset.ts` | 215 | *(entry / side-effect)* |
| `scripts/capture-visual-snapshots.ts` | 899 | *(entry / side-effect)* |
| `scripts/check-docs-drift.ts` | 490 | *(entry / side-effect)* |
| `scripts/generate-codebase-index.ts` | 220 | `buildCodebaseIndexMarkdown` |
| `src/App.tsx` | 1390 | `App` |
| `src/components/AdminUsersModal.tsx` | 2586 | `AdminUsersModal` |
| `src/components/AppErrorBoundary.tsx` | 98 | *(entry / side-effect)* |
| `src/components/Artwork2DPanel.tsx` | 1246 | `ArtworkPanelTab`, `Artwork2DPanel` |
| `src/components/AuthGate.tsx` | 777 | `AuthGate` |
| `src/components/BCTInspectorRail.tsx` | 1701 | *(entry / side-effect)* |
| `src/components/Box3DViewer.tsx` | 2117 | `Box3DViewer` |
| `src/components/BoxPreview.tsx` | 2185 | `BoxPreview` |
| `src/components/EngineeringSheet.tsx` | 359 | `EngineeringSheet` |
| `src/components/HalftoneSheetDecor.tsx` | 217 | `HalftonePerimeterFrame`, `TopRightSheetHalftone` |
| `src/components/InteractiveMatrixCanvas.tsx` | 829 | `InteractiveMatrixCanvas` |
| `src/components/MobileGenieSheet.tsx` | 116 | `GenieDockOrigin`, `MobileGenieSheet` |
| `src/components/PalletizerWorkspace.tsx` | 4450 | `PalletizerWorkspace` |
| `src/components/ProjectsModal.tsx` | 189 | `ProjectsModal` |
| `src/components/PWAInstallControl.tsx` | 156 | `usePWAInstall`, `useOnlineStatus`, `PWAInstallButton`, `OfflineIndicator` |
| `src/components/Sidebar.tsx` | 890 | *(entry / side-effect)* |
| `src/components/tactile/TactileUI.tsx` | 548 | `TactileButtonProps`, `TactileButton`, `SegmentedOption`, `TactileSegmented`, `TactileInputWellProps`, `TactileInputWell`, `TactileTextareaWellProps`, `TactileTextareaWell`, `TactileSelectOption`, `TactileSelect`, `TactileCheckbox`, `TactileSwitch`, *+1 more* |
| `src/components/VehicleLoadingBlueprint.tsx` | 946 | `VehicleLoadingBlueprint` |
| `src/components/WhatsAppContactButton.tsx` | 79 | `WhatsAppLogoIcon`, `WhatsAppContactButton` |
| `src/hooks/useWorkspaceLayout.ts` | 211 | `ViewportTier`, `resolveViewportTier`, `resolveShortLandscape`, `useWorkspaceLayout` |
| `src/main.tsx` | 48 | *(entry / side-effect)* |
| `src/types.ts` | 1941 | `BoxStyle`, `DisplayUnit`, `TolerancePreset`, `ExportMode`, `ViewMode`, `FluteDirection`, `CurrencyCode`, `ForceUnit`, `BctCalculationMethod`, `PrintPresetId`, `KraftGradeId`, `WhiteTopGradeId`, *+105 more* |
| `src/utils/apiSession.ts` | 72 | `getClientSessionToken`, `setClientSessionToken`, `clearClientSessionToken`, `resolveApiUrl`, `authFetch` |
| `src/utils/browserEngine.ts` | 228 | `EngineTier`, `EngineQualityProfile`, `getEngineProfile`, `createDynamicResolutionController`, `scheduleIdleWork` |
| `src/utils/dieline.ts` | 768 | `PlakbanZoneMetrics`, `computePlakbanZoneMetrics`, `generateRSCDieline` |
| `src/utils/engineering.ts` | 1111 | `MM_TO_IN`, `KGF_CM_TO_LBF_IN`, `LBF_TO_KGF`, `MCKEE_K`, `formatMoney`, `getEffectiveRct`, `formatSubstanceString`, `formatMaterialsSummary`, `parseSubstanceString`, `inferFluteIdFromThickness`, `computeWeightedPrintCoverage`, `detectPrintPresetId`, *+19 more* |
| `src/utils/fontLoader.ts` | 48 | `initBrandFonts` |
| `src/utils/lazyWithRetry.ts` | 87 | `isChunkLoadError`, `clearBrowserCachesAndReload`, `lazyWithRetry` |
| `src/utils/palletizer.ts` | 2888 | `PalletPhysicsContext`, `normalizePalletEdgeMarginMm`, `computeEffectivePalletDims`, `computeCasePackSolutions`, `pickOptimalPatternType`, `buildSmartPalletAdvisorFromEvals`, `computeSmartPalletAdvisor`, `evaluateAllPalletPatternsCached`, `evaluateAllPalletPatterns`, `computePerfectionistTuningReport` |
| `src/utils/palletizerReportPdf.ts` | 2309 | `UvPoint`, `IsoDimAnchors`, `TopDimAnchors`, `PalletizerPdfCaptureSet`, `PalletizerPdfReportInput`, `exportPalletizerReportPdf` |
| `src/utils/palletizerVectorExport.ts` | 1321 | `VectorStrokePreset`, `PalletVectorExportOptions`, `VectorSegment`, `VectorRect`, `VectorText`, `VectorGroup`, `PalletVectorScene`, `VECTOR_STROKE_PRESETS`, `buildPalletVectorScene`, `serializePalletVectorToSvg`, `getPalletVectorSceneCacheKey`, `getCachedPalletVectorScene`, *+3 more* |
| `src/utils/units.ts` | 91 | `fromMm`, `toMm`, `formatValue`, `formatDimWithUnit`, `computeGS1CheckDigit`, `ITF14Validation`, `validateITF14`, `fixITF14CheckDigit` |
| `src/utils/vehicleLoading.ts` | 1030 | `buildVehicleConfigFromPreset`, `computeVehicleVerticalLimits`, `computeSyncedPalletMaxHeight`, `solveVehicleLoading`, `solveFloorLoading`, `comparePalletVsFloor` |
| `src/utils/whatsapp.ts` | 123 | `WHATSAPP_ADMIN_PHONE`, `WhatsAppRequestContext`, `collectAccessMetadata`, `buildAdminWhatsAppUrl` |
| `src/workers/palletizer.worker.ts` | 87 | `SmartPalletAdvisorResult`, `PalletizerWorkerRequest`, `PalletizerWorkerResponse` |

---

## 2. Large File Section Jump-Table (>= 400 lines)

Jump straight to these line anchors using targeted `StartLine`/`EndLine` reads to save tokens/credits:

- **`server.ts` (4369 lines)**: `L12` fn resolveServerPort · `L31` fn isEnvPlaceholder · `L42` fn resolveSessionSecret · `L127` fn ensureUsersColumn · `L138` fn getSystemMeta · `L145` fn setSystemMeta · `L154` fn deleteSystemMeta · `L160` fn encryptSecret · `L168` fn decryptSecret · `L202` fn getConsoleSmtpRaw · `L212` fn resolveSmtpConfig · `L245` fn sanitizeHeaderVal · `L249` fn sendSmtpEmail · `L449` fn generateHumanRecoveryKey · `L459` fn recordAuditLog · `L494` fn hashPassword · `L500` fn verifyPassword · `L510` fn timingSafeStringMatch · `L518` fn ensureAdminAccount · `L571` fn sanitizeUser · `L590` fn signSessionToken · `L599` fn verifySessionToken · `L627` fn parseCookies · `L646` fn isHttpsRequest · `L658` fn setSessionCookie · `L670` fn clearSessionCookie · `L682` fn extractSessionToken · `L692` fn clipStr
- **`scripts/capture-visual-snapshots.ts` (899 lines)**: `L59` fn printHelp · `L78` fn findChromeBinary · `L201` fn launchChromium · `L255` fn getPageWsUrl · `L265` fn setViewport · `L276` fn waitFrames · `L289` fn waitForSelector · `L301` fn waitForText · `L313` fn clickByText · `L346` fn clickSelector · `L364` fn snap · `L403` fn loginAsAdmin · `L432` fn openAdminConsole · `L454` fn openProjectsModal · `L475` fn main
- **`scripts/check-docs-drift.ts` (490 lines)**: `L21` fn readText · `L27` fn parseArgs · `L34` fn printHelp · `L58` fn checkGitDrift · `L145` fn checkApiRoutesDrift · `L183` fn checkSchemaDrift · `L225` fn checkEnvVarDrift · `L268` fn checkScriptsAndDockerParity · `L306` fn checkCodebaseIndexFreshness · `L338` fn checkVisualSnapshotsIntegrity · `L426` fn main
- **`src/App.tsx` (1390 lines)**: `L66` export App · `L311` handleFooterBrandSecretTap · `L384` handleLogout · `L521` handleUnitChange
- **`src/components/AdminUsersModal.tsx` (2586 lines)**: `L59` fn formatBytes · `L67` fn formatDuration · `L97` fn buildHermesAgentSnippets · `L145` export AdminUsersModal · `L401` handleCreateUser · `L441` handleBulkApprove · `L468` handleToggleStatus · `L497` handleSaveEditUser · `L534` handleSetPassword · `L572` handleRevokeSessions · `L607` handleDeleteUser · `L631` handleChangeOwnPassword · `L675` handleRotateRecoveryKey · `L701` handleCopyRecoveryKey · `L712` handleDownloadRecoveryKeyTxt · `L736` handleDownloadBackup · `L790` handlePromoteCoAdmin · `L824` handleQuickCreateCoAdmin · `L833` handleSaveSmtp · `L869` handleClearConsoleSmtp · `L901` handleTestSmtp · `L924` handleGenerateAgentKey · `L976` handleRevokeAgentKey · `L999` handleCopyAgentSnippet
- **`src/components/Artwork2DPanel.tsx` (1246 lines)**: `L77` fn round1 · `L81` export Artwork2DPanel
- **`src/components/AuthGate.tsx` (777 lines)**: `L23` export AuthGate · `L83` handleSecretLogoTap · `L128` handleRequestOtp · `L163` handleAdminRecover · `L242` handleSubmit
- **`src/components/BCTInspectorRail.tsx` (1701 lines)**: `L73` fn BCTInspectorRail · `L139` handleDimChange · `L166` handleBoardGradeChange · `L189` handleFluteChange · `L209` handleLayerChange · `L228` handleCustomRctChange · `L246` handleSelectPrintPreset · `L274` handleCyclePanel · `L307` handleCoverageSlider · `L326` handleColorsChange · `L360` handleSaveSnapshot · `L419` handleDeleteHistory · `L434` handleRestoreSnapshot
- **`src/components/Box3DViewer.tsx` (2117 lines)**: `L27` fn createCardboardTexture · `L83` fn disposeObject3D · `L105` fn addRoundedRectHole · `L127` fn buildRoundedRectShape · `L148` fn addPillHole · `L168` fn buildPillShape · `L181` fn addVerticalSlotHole · `L201` fn buildVerticalSlotShape · `L235` fn applyHingeFoldKinematics · `L271` export Box3DViewer
- **`src/components/BoxPreview.tsx` (2185 lines)**: `L75` fn truncateText · `L80` fn wrapLines · `L101` export BoxPreview · `L499` handleWheel · `L505` handlePointerDown · `L521` handlePointerMove · `L597` handlePointerUp
- **`src/components/InteractiveMatrixCanvas.tsx` (829 lines)**: `L66` fn clamp01 · `L70` fn smoothstep · `L75` fn hash2D · `L80` fn distToSegment · `L96` fn buildProjectedBoxEdges · `L176` fn computeSubtlePinkAccent · `L209` fn sampleFormHalftone · `L273` fn sampleFormTopoDash · `L319` fn sampleFormDitherGrid · `L372` fn sampleFormIsoBox · `L413` export InteractiveMatrixCanvas
- **`src/components/PalletizerWorkspace.tsx` (4450 lines)**: `L104` fn TactileSection · `L115` fn TactileToggle · `L132` fn TactileSlider · `L178` fn createWoodPalletTexture · `L198` fn createCartonSideTexture · `L217` fn createCartonTopTexture · `L259` fn disposeGroupResources · `L282` fn computeHeatmapStressHex · `L311` fn populatePalletGroup · `L741` fn PatternFootprintSvg · `L860` export PalletizerWorkspace · `L1203` handleLayerCountChange · `L1348` handleSelectVehiclePreset · `L1361` handleApplyPerfectionistToCad · `L1382` handleApplyBoardCandidate · `L1767` setCameraPreset · `L1806` handleExportVectorSvg · `L1821` handleExportVectorPdf · `L1840` handleExportPdfReport
- **`src/components/Sidebar.tsx` (890 lines)**: `L41` fn Sidebar · `L85` handlePerforationTypeChange · `L104` handlePerforationRuleModeChange
- **`src/components/tactile/TactileUI.tsx` (548 lines)**: `L81` export TactileSegmented · `L94` handleKeyDown · `L230` export TactileSelect · `L407` export TactileCheckbox · `L439` export TactileSwitch · `L479` export TactileSheet
- **`src/components/VehicleLoadingBlueprint.tsx` (946 lines)**: `L25` export VehicleLoadingBlueprint
- **`src/utils/dieline.ts` (768 lines)**: `L19` export computePlakbanZoneMetrics · `L45` export generateRSCDieline
- **`src/utils/engineering.ts` (1111 lines)**: `L38` export formatMoney · `L53` export getEffectiveRct · `L60` export formatSubstanceString · `L73` export formatMaterialsSummary · `L83` export parseSubstanceString · `L133` export inferFluteIdFromThickness · `L150` export computeWeightedPrintCoverage · `L163` export detectPrintPresetId · `L177` export estimateTappiEctFromLayers · `L218` export estimateLegacyBctProEct · `L234` export resolveTappiEct · `L266` export resolveLegacyBctProEct · `L299` export computeMcKeeBctKgf · `L316` export computePrintingFactor · `L330` export computeHumidityFactor · `L356` export getIndonesianHumidityContext · `L407` export computeHandlingFactor · `L411` export getEffectiveProductNetWeightKg · `L419` export computeCaseGrossWeightKg · `L429` export computeStabilityFactor · `L442` export getPrintCoverageDescription · `L450` export getRecommendedCoverageHint · `L458` export loadBctHistory · `L470` export saveBctHistory · `L479` fn buildMethodResult · `L533` export computeEngineeringAnalysis · `L1082` export computeBoardBurstKpa · `L1101` export computeSurfaceFrictionCoeff
- **`src/utils/palletizer.ts` (2888 lines)**: `L53` fn round1 · `L57` fn round2 · `L61` fn clamp · `L65` fn clampMin · `L73` export normalizePalletEdgeMarginMm · `L78` export computeEffectivePalletDims · `L95` export computeCasePackSolutions · `L271` fn centerSlots · `L298` fn flipLayer180 · `L307` fn mirrorLayerX · `L315` fn mirrorLayerZ · `L323` fn rotateLayer90 · `L340` fn buildGridSlots · `L400` fn applyPerimeterFlush · `L517` fn measureInternalGaps · `L658` fn hasAnyOverlap · `L680` fn solveGuillotinePack · `L799` fn solveSplitBlockAlternate · `L868` fn resolvePerimeterAlignmentChoice · `L994` fn generatePinwheelSlots · `L1112` fn measurePairBridging · `L1241` fn pickBestInterlockTransform · `L1294` fn generateSingleLayerSlots · `L1412` fn detectFaultLines · `L1501` fn buildAndScoreEvaluation · `L1998` export pickOptimalPatternType · `L2016` export buildSmartPalletAdvisorFromEvals · `L2060` export computeSmartPalletAdvisor
- **`src/utils/palletizerReportPdf.ts` (2309 lines)**: `L99` fn loadTotaleRoomLogoPng · `L138` fn setFill · `L142` fn setStroke · `L146` fn setText · `L150` fn safeAsciiPdf · `L162` fn truncateToFit · `L173` fn getBctStatusStyle · `L191` fn sortPlacementsForOperator · `L203` fn computeLayerFootprint · `L234` fn drawTactileReportHeader · `L304` fn drawKvCard · `L356` fn drawArrowVector · `L381` fn drawDimensionLineHorizontal · `L408` fn drawDimensionLineVertical · `L435` fn drawProjectedSegmentDimension · `L480` fn drawLayerGuideCard · `L818` export exportPalletizerReportPdf
- **`src/utils/palletizerVectorExport.ts` (1321 lines)**: `L116` fn round3 · `L124` fn projectIso · `L132` fn buildFrontFace2D · `L180` fn buildCuboidFrontFaces · `L224` fn buildCuboidVisibleEdges · `L249` fn computeOccludedInterval · `L298` fn subtractInterval · `L320` fn deduplicateAndMergeSegments · `L412` fn buildChevron2DPoints · `L450` fn clip2DSegmentAgainstRects · `L501` fn buildTopViewLayerVectors · `L632` fn buildIsometricStackVectors · `L849` fn formatLayerList · `L864` export buildPalletVectorScene · `L1119` fn escapeXml · `L1131` export serializePalletVectorToSvg · `L1175` fn buildExportBaseFilename · `L1187` export getPalletVectorSceneCacheKey · `L1211` export getCachedPalletVectorScene · `L1215` export buildPalletVectorSceneCached · `L1239` export downloadPalletVectorSvg · `L1261` export exportPalletVectorPdf
- **`src/utils/vehicleLoading.ts` (1030 lines)**: `L17` fn round1 · `L21` export buildVehicleConfigFromPreset · `L64` export computeVehicleVerticalLimits · `L112` export computeSyncedPalletMaxHeight · `L194` fn buildUniformFloorCandidate · `L225` fn buildMixedFloorCandidates · `L358` export solveVehicleLoading · `L706` export solveFloorLoading · `L982` export comparePalletVsFloor

---

## 3. Express API Route Line Map (`server.ts`)

| Line | Method | Path |
| ---: | :--- | :--- |
| `L2091` | `GET` | `/api/health` |
| `L2095` | `GET` | `/api/fonts/available` |
| `L2133` | `GET` | `/api/auth/me` |
| `L2165` | `POST` | `/api/auth/register` |
| `L2263` | `POST` | `/api/auth/login` |
| `L2397` | `POST` | `/api/auth/admin-recover` |
| `L2487` | `GET` | `/api/auth/recovery-options` |
| `L2499` | `POST` | `/api/auth/admin-recover/request-otp` |
| `L2638` | `POST` | `/api/auth/admin-recover/verify-otp` |
| `L2759` | `POST` | `/api/auth/logout` |
| `L2765` | `GET` | `/api/admin/users` |
| `L2789` | `POST` | `/api/admin/users` |
| `L2853` | `PATCH` | `/api/admin/users/:id` |
| `L2938` | `POST` | `/api/admin/users/bulk-approve` |
| `L2966` | `PATCH` | `/api/admin/users/:id/status` |
| `L3031` | `PATCH` | `/api/admin/users/:id/password` |
| `L3071` | `POST` | `/api/admin/users/:id/revoke-sessions` |
| `L3111` | `DELETE` | `/api/admin/users/:id` |
| `L3157` | `POST` | `/api/admin/security/change-password` |
| `L3203` | `POST` | `/api/admin/security/rotate-recovery-key` |
| `L3227` | `GET` | `/api/admin/security/smtp` |
| `L3254` | `POST` | `/api/admin/security/smtp` |
| `L3327` | `POST` | `/api/admin/security/smtp-test` |
| `L3383` | `GET` | `/api/admin/security/agent-key` |
| `L3387` | `POST` | `/api/admin/security/agent-key` |
| `L3403` | `DELETE` | `/api/admin/security/agent-key` |
| `L3417` | `GET` | `/api/agent/skill` |
| `L3432` | `ALL` | `/api/agent/connect` |
| `L3474` | `POST` | `/api/agent/calculate` |
| `L3483` | `POST` | `/api/agent/dieline` |
| `L3507` | `GET` | `/api/agent/dieline/download` |
| `L3523` | `GET` | `/api/mcp` |
| `L3530` | `POST` | `/api/mcp` |
| `L3795` | `GET` | `/api/admin/health-radar` |
| `L4041` | `GET` | `/api/admin/audit-logs` |
| `L4092` | `GET` | `/api/admin/backup/sqlite` |
| `L4128` | `GET` | `/api/admin/backup/json` |
| `L4164` | `GET` | `/api/history` |
| `L4184` | `POST` | `/api/history` |
| `L4202` | `DELETE` | `/api/history/:id` |
| `L4211` | `GET` | `/api/projects` |
| `L4245` | `POST` | `/api/projects` |
| `L4277` | `DELETE` | `/api/projects/:id` |
