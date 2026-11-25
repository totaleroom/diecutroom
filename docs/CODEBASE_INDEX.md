# DieCut.Room — Auto-Generated Codebase Index (Credit-Saver Map)

> **Do not edit manually.** Regenerate anytime with `npm run index:build` (`node scripts/generate-codebase-index.ts`, zero dependencies).
> AI Agents: Read this index FIRST to jump directly to target line ranges without scanning multi-thousand-line files.

- **Indexed Files**: 36 TypeScript/TSX modules (32,911 total lines)
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
| `src/App.tsx` | 1022 | `App` |
| `src/components/AdminUsersModal.tsx` | 2586 | `AdminUsersModal` |
| `src/components/AppErrorBoundary.tsx` | 98 | *(entry / side-effect)* |
| `src/components/AuthGate.tsx` | 777 | `AuthGate` |
| `src/components/BCTInspectorRail.tsx` | 1792 | `BCTInspectorRail` |
| `src/components/Box3DViewer.tsx` | 2058 | `Box3DViewer` |
| `src/components/BoxPreview.tsx` | 1215 | `BoxPreview` |
| `src/components/EngineeringSheet.tsx` | 514 | `EngineeringSheet` |
| `src/components/HalftoneSheetDecor.tsx` | 217 | `HalftonePerimeterFrame`, `TopRightSheetHalftone` |
| `src/components/InteractiveMatrixCanvas.tsx` | 819 | `InteractiveMatrixCanvas` |
| `src/components/PalletizerWorkspace.tsx` | 3752 | `PalletizerWorkspace` |
| `src/components/ProjectsModal.tsx` | 189 | `ProjectsModal` |
| `src/components/PWAInstallControl.tsx` | 156 | `usePWAInstall`, `useOnlineStatus`, `PWAInstallButton`, `OfflineIndicator` |
| `src/components/Sidebar.tsx` | 1316 | `Sidebar` |
| `src/components/tactile/TactileUI.tsx` | 548 | `TactileButtonProps`, `TactileButton`, `SegmentedOption`, `TactileSegmented`, `TactileInputWellProps`, `TactileInputWell`, `TactileTextareaWellProps`, `TactileTextareaWell`, `TactileSelectOption`, `TactileSelect`, `TactileCheckbox`, `TactileSwitch`, *+1 more* |
| `src/components/WhatsAppContactButton.tsx` | 79 | `WhatsAppLogoIcon`, `WhatsAppContactButton` |
| `src/hooks/useWorkspaceLayout.ts` | 209 | `ViewportTier`, `resolveViewportTier`, `resolveShortLandscape`, `useWorkspaceLayout` |
| `src/main.tsx` | 48 | *(entry / side-effect)* |
| `src/types.ts` | 1361 | `BoxStyle`, `DisplayUnit`, `TolerancePreset`, `ExportMode`, `ViewMode`, `FluteDirection`, `CurrencyCode`, `ForceUnit`, `BctCalculationMethod`, `PrintPresetId`, `KraftGradeId`, `WhiteTopGradeId`, *+81 more* |
| `src/utils/apiSession.ts` | 72 | `getClientSessionToken`, `setClientSessionToken`, `clearClientSessionToken`, `resolveApiUrl`, `authFetch` |
| `src/utils/browserEngine.ts` | 228 | `EngineTier`, `EngineQualityProfile`, `getEngineProfile`, `createDynamicResolutionController`, `scheduleIdleWork` |
| `src/utils/dieline.ts` | 727 | `generateRSCDieline` |
| `src/utils/engineering.ts` | 1065 | `MM_TO_IN`, `KGF_CM_TO_LBF_IN`, `LBF_TO_KGF`, `MCKEE_K`, `formatMoney`, `getEffectiveRct`, `formatSubstanceString`, `formatMaterialsSummary`, `parseSubstanceString`, `inferFluteIdFromThickness`, `computeWeightedPrintCoverage`, `detectPrintPresetId`, *+16 more* |
| `src/utils/fontLoader.ts` | 48 | `initBrandFonts` |
| `src/utils/lazyWithRetry.ts` | 87 | `isChunkLoadError`, `clearBrowserCachesAndReload`, `lazyWithRetry` |
| `src/utils/palletizer.ts` | 2506 | `PalletPhysicsContext`, `normalizePalletEdgeMarginMm`, `computeEffectivePalletDims`, `computeCasePackSolutions`, `pickOptimalPatternType`, `computeSmartPalletAdvisor`, `evaluateAllPalletPatterns`, `computePerfectionistTuningReport` |
| `src/utils/palletizerReportPdf.ts` | 1660 | `UvPoint`, `IsoDimAnchors`, `TopDimAnchors`, `PalletizerPdfCaptureSet`, `PalletizerPdfReportInput`, `exportPalletizerReportPdf` |
| `src/utils/palletizerVectorExport.ts` | 1268 | `VectorStrokePreset`, `PalletVectorExportOptions`, `VectorSegment`, `VectorRect`, `VectorText`, `VectorGroup`, `PalletVectorScene`, `VECTOR_STROKE_PRESETS`, `buildPalletVectorScene`, `serializePalletVectorToSvg`, `downloadPalletVectorSvg`, `exportPalletVectorPdf` |
| `src/utils/units.ts` | 91 | `fromMm`, `toMm`, `formatValue`, `formatDimWithUnit`, `computeGS1CheckDigit`, `ITF14Validation`, `validateITF14`, `fixITF14CheckDigit` |
| `src/utils/whatsapp.ts` | 123 | `WHATSAPP_ADMIN_PHONE`, `WhatsAppRequestContext`, `collectAccessMetadata`, `buildAdminWhatsAppUrl` |
| `src/workers/palletizer.worker.ts` | 87 | `SmartPalletAdvisorResult`, `PalletizerWorkerRequest`, `PalletizerWorkerResponse` |

---

## 2. Large File Section Jump-Table (>= 400 lines)

Jump straight to these line anchors using targeted `StartLine`/`EndLine` reads to save tokens/credits:

- **`server.ts` (4369 lines)**: `L12` fn resolveServerPort · `L31` fn isEnvPlaceholder · `L42` fn resolveSessionSecret · `L127` fn ensureUsersColumn · `L138` fn getSystemMeta · `L145` fn setSystemMeta · `L154` fn deleteSystemMeta · `L160` fn encryptSecret · `L168` fn decryptSecret · `L202` fn getConsoleSmtpRaw · `L212` fn resolveSmtpConfig · `L245` fn sanitizeHeaderVal · `L249` fn sendSmtpEmail · `L449` fn generateHumanRecoveryKey · `L459` fn recordAuditLog · `L494` fn hashPassword · `L500` fn verifyPassword · `L510` fn timingSafeStringMatch · `L518` fn ensureAdminAccount · `L571` fn sanitizeUser · `L590` fn signSessionToken · `L599` fn verifySessionToken · `L627` fn parseCookies · `L646` fn isHttpsRequest · `L658` fn setSessionCookie · `L670` fn clearSessionCookie · `L682` fn extractSessionToken · `L692` fn clipStr
- **`scripts/capture-visual-snapshots.ts` (899 lines)**: `L59` fn printHelp · `L78` fn findChromeBinary · `L201` fn launchChromium · `L255` fn getPageWsUrl · `L265` fn setViewport · `L276` fn waitFrames · `L289` fn waitForSelector · `L301` fn waitForText · `L313` fn clickByText · `L346` fn clickSelector · `L364` fn snap · `L403` fn loginAsAdmin · `L432` fn openAdminConsole · `L454` fn openProjectsModal · `L475` fn main
- **`scripts/check-docs-drift.ts` (490 lines)**: `L21` fn readText · `L27` fn parseArgs · `L34` fn printHelp · `L58` fn checkGitDrift · `L145` fn checkApiRoutesDrift · `L183` fn checkSchemaDrift · `L225` fn checkEnvVarDrift · `L268` fn checkScriptsAndDockerParity · `L306` fn checkCodebaseIndexFreshness · `L338` fn checkVisualSnapshotsIntegrity · `L426` fn main
- **`src/App.tsx` (1022 lines)**: `L57` export App · `L270` handleFooterBrandSecretTap · `L324` handleLogout · `L338` handleToggleLayer
- **`src/components/AdminUsersModal.tsx` (2586 lines)**: `L59` fn formatBytes · `L67` fn formatDuration · `L97` fn buildHermesAgentSnippets · `L145` export AdminUsersModal · `L401` handleCreateUser · `L441` handleBulkApprove · `L468` handleToggleStatus · `L497` handleSaveEditUser · `L534` handleSetPassword · `L572` handleRevokeSessions · `L607` handleDeleteUser · `L631` handleChangeOwnPassword · `L675` handleRotateRecoveryKey · `L701` handleCopyRecoveryKey · `L712` handleDownloadRecoveryKeyTxt · `L736` handleDownloadBackup · `L790` handlePromoteCoAdmin · `L824` handleQuickCreateCoAdmin · `L833` handleSaveSmtp · `L869` handleClearConsoleSmtp · `L901` handleTestSmtp · `L924` handleGenerateAgentKey · `L976` handleRevokeAgentKey · `L999` handleCopyAgentSnippet
- **`src/components/AuthGate.tsx` (777 lines)**: `L23` export AuthGate · `L83` handleSecretLogoTap · `L128` handleRequestOtp · `L163` handleAdminRecover · `L242` handleSubmit
- **`src/components/BCTInspectorRail.tsx` (1792 lines)**: `L67` export BCTInspectorRail · `L133` handleDimChange · `L178` handleFluteChange · `L198` handleLayerChange · `L217` handleCustomRctChange · `L235` handleSelectPrintPreset · `L263` handleCyclePanel · `L296` handleCoverageSlider · `L315` handleColorsChange · `L349` handleSaveSnapshot · `L408` handleDeleteHistory · `L423` handleRestoreSnapshot
- **`src/components/Box3DViewer.tsx` (2058 lines)**: `L26` fn createCardboardTexture · `L82` fn disposeObject3D · `L104` fn addRoundedRectHole · `L126` fn buildRoundedRectShape · `L147` fn addPillHole · `L167` fn buildPillShape · `L180` fn addVerticalSlotHole · `L200` fn buildVerticalSlotShape · `L234` fn applyHingeFoldKinematics · `L270` export Box3DViewer
- **`src/components/BoxPreview.tsx` (1215 lines)**: `L45` fn truncateText · `L50` fn wrapLines · `L71` export BoxPreview · `L204` handleWheel · `L210` handlePointerDown · `L222` handlePointerMove · `L230` handlePointerUp
- **`src/components/EngineeringSheet.tsx` (514 lines)**: `L33` export EngineeringSheet · `L53` handleLayerChange · `L68` handleCurrencyChange · `L86` handleFluteDirChange
- **`src/components/InteractiveMatrixCanvas.tsx` (819 lines)**: `L66` fn clamp01 · `L70` fn smoothstep · `L75` fn hash2D · `L80` fn distToSegment · `L96` fn buildProjectedBoxEdges · `L176` fn computeSubtlePinkAccent · `L209` fn sampleFormHalftone · `L273` fn sampleFormTopoDash · `L319` fn sampleFormDitherGrid · `L372` fn sampleFormIsoBox · `L413` export InteractiveMatrixCanvas
- **`src/components/PalletizerWorkspace.tsx` (3752 lines)**: `L80` fn TactileSection · `L91` fn TactileToggle · `L108` fn TactileSlider · `L148` fn createWoodPalletTexture · `L168` fn createCartonSideTexture · `L187` fn createCartonTopTexture · `L229` fn disposeGroupResources · `L257` fn populatePalletGroup · `L740` fn PatternFootprintSvg · `L859` export PalletizerWorkspace · `L1127` handleApplyCasePackToCad · `L1158` handleApplyPerfectionistToCad · `L1179` handleApplyBoardAdvice · `L1484` setCameraPreset · `L1504` handleOpenPdfModal · `L1529` handleExportVectorSvg · `L1544` handleExportVectorPdf · `L1563` handleExportPdfReport
- **`src/components/Sidebar.tsx` (1316 lines)**: `L46` export Sidebar · `L68` handleDimensionChange · `L109` handleProductField · `L126` handleTolerancePreset · `L145` handleSnapZeroHeadspace · `L154` handleInputModeChange · `L190` handlePerforationTypeChange · `L209` handlePerforationRuleModeChange
- **`src/components/tactile/TactileUI.tsx` (548 lines)**: `L81` export TactileSegmented · `L94` handleKeyDown · `L230` export TactileSelect · `L407` export TactileCheckbox · `L439` export TactileSwitch · `L479` export TactileSheet
- **`src/utils/dieline.ts` (727 lines)**: `L4` export generateRSCDieline
- **`src/utils/engineering.ts` (1065 lines)**: `L38` export formatMoney · `L53` export getEffectiveRct · `L60` export formatSubstanceString · `L73` export formatMaterialsSummary · `L83` export parseSubstanceString · `L133` export inferFluteIdFromThickness · `L150` export computeWeightedPrintCoverage · `L163` export detectPrintPresetId · `L177` export estimateTappiEctFromLayers · `L218` export estimateLegacyBctProEct · `L234` export resolveTappiEct · `L266` export resolveLegacyBctProEct · `L299` export computeMcKeeBctKgf · `L316` export computePrintingFactor · `L326` export computeHumidityFactor · `L351` export computeHandlingFactor · `L355` export computeStabilityFactor · `L368` export getPrintCoverageDescription · `L376` export getRecommendedCoverageHint · `L384` export loadBctHistory · `L396` export saveBctHistory · `L405` fn buildMethodResult · `L459` export computeEngineeringAnalysis · `L1036` export computeBoardBurstKpa · `L1055` export computeSurfaceFrictionCoeff
- **`src/utils/palletizer.ts` (2506 lines)**: `L48` fn round1 · `L52` fn round2 · `L56` fn clamp · `L60` fn clampMin · `L68` export normalizePalletEdgeMarginMm · `L73` export computeEffectivePalletDims · `L90` export computeCasePackSolutions · `L266` fn centerSlots · `L293` fn flipLayer180 · `L302` fn mirrorLayerX · `L310` fn mirrorLayerZ · `L318` fn rotateLayer90 · `L335` fn buildGridSlots · `L395` fn applyPerimeterFlush · `L512` fn measureInternalGaps · `L653` fn hasAnyOverlap · `L675` fn solveGuillotinePack · `L794` fn solveSplitBlockAlternate · `L863` fn resolvePerimeterAlignmentChoice · `L989` fn generatePinwheelSlots · `L1107` fn measurePairBridging · `L1236` fn pickBestInterlockTransform · `L1289` fn generateSingleLayerSlots · `L1407` fn detectFaultLines · `L1496` fn buildAndScoreEvaluation · `L1993` export pickOptimalPatternType · `L2011` export computeSmartPalletAdvisor · `L2075` export evaluateAllPalletPatterns
- **`src/utils/palletizerReportPdf.ts` (1660 lines)**: `L91` fn loadTotaleRoomLogoPng · `L130` fn setFill · `L134` fn setStroke · `L138` fn setText · `L142` fn safeAsciiPdf · `L154` fn truncateToFit · `L165` fn getBctStatusStyle · `L183` fn sortPlacementsForOperator · `L195` fn computeLayerFootprint · `L226` fn drawTactileReportHeader · `L296` fn drawKvCard · `L348` fn drawArrowVector · `L373` fn drawDimensionLineHorizontal · `L400` fn drawDimensionLineVertical · `L427` fn drawProjectedSegmentDimension · `L472` fn drawLayerGuideCard · `L810` export exportPalletizerReportPdf
- **`src/utils/palletizerVectorExport.ts` (1268 lines)**: `L116` fn round3 · `L124` fn projectIso · `L132` fn buildFrontFace2D · `L180` fn buildCuboidFrontFaces · `L224` fn buildCuboidVisibleEdges · `L249` fn computeOccludedInterval · `L298` fn subtractInterval · `L320` fn deduplicateAndMergeSegments · `L412` fn buildChevron2DPoints · `L450` fn clip2DSegmentAgainstRects · `L501` fn buildTopViewLayerVectors · `L632` fn buildIsometricStackVectors · `L849` fn formatLayerList · `L864` export buildPalletVectorScene · `L1118` fn escapeXml · `L1130` export serializePalletVectorToSvg · `L1174` fn buildExportBaseFilename · `L1186` export downloadPalletVectorSvg · `L1208` export exportPalletVectorPdf

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
