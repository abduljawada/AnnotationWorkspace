const state = {
  schema: null,
  rules: [],
  ruleCatalog: null,
  samples: [],
  sourceVideos: [],
  sourceVideoGridSettings: {},
  sourceVideoFootageStartTimes: {},
  summary: null,
  selectedId: null,
  selectedSourceVideoKey: null,
  selectedRuleId: null,
  sourceVideoSearch: "",
  ruleSearch: "",
  violationInsightScope: "both",
  violationCompleteOnly: false,
  videoViolationInsightScope: "both",
  videoViolationCompleteOnly: false,
  openVideoInsightIds: new Set(),
  activeWorkspaceTab: "samples",
  search: "",
  sampleVisibilityScope: "both",
  sampleSidebarCollapsed: localStorage.getItem("annotationWorkspace.sampleSidebarCollapsed") === "true",
  showDeleted: false,
  showVideoGrid: localStorage.getItem("annotationWorkspace.showVideoGrid") === "true",
  gridSettingsSaveTimer: null,
  footageStartTimeSaveTimer: null,
  sourceVideoPositionSaveTimer: null,
  sourceTimelineDrag: null,
  qwenDraft: null,
  pendingSampleId: null,
  pendingFields: {},
  saveTimer: null,
  saveMessage: "Loading workspace…",
};

const SOURCE_EXTRACT_EXCLUDED_VIOLATION_TYPES = new Set(["lane", "lane_switching", "left_turn"]);
const QWEN_SETTINGS_KEY = "annotationWorkspace.qwenSettings";
const QWEN_PROVIDER_DEFAULT_ENDPOINTS = {
  ollama: "http://127.0.0.1:11434",
  lmstudio: "http://127.0.0.1:1234",
};
const HIDDEN_FIELD_OPTIONS = {};
const LATEX_ANNOTATION_FIELDS = [
  ["clip_name", "clip_export_name"],
  ["answer_date", "date"],
  ["answer_time", "time"],
  ["answer_violation_type", "violation_type"],
  ["answer_violator_type", "violator_type"],
  ["answer_color", "color"],
  ["answer_initial_position", "entering_direction"],
  ["answer_initial_lane", "entering_lane"],
  ["answer_final_position", "exiting_direction"],
  ["answer_final_lane", "exiting_lane"],
  ["answer_intersection_type", "intersection_type"],
  ["answer_weather", "weather"],
  ["answer_light", "light"],
  ["answer_description", "description"],
];
const LATEX_ANNOTATION_WRAP_COLUMN = 92;

const elements = {
  summaryGrid: document.getElementById("summary-grid"),
  categoryInsights: document.getElementById("category-insights"),
  violationInsightScopeSelect: document.getElementById("violation-insight-scope-select"),
  violationCompleteOnlyToggle: document.getElementById("violation-complete-only-toggle"),
  videoViolationInsightScopeSelect: document.getElementById("video-violation-insight-scope-select"),
  videoViolationCompleteOnlyToggle: document.getElementById("video-violation-complete-only-toggle"),
  videoCategoryInsights: document.getElementById("video-category-insights"),
  saveStatus: document.getElementById("save-status"),
  exportScopeSelect: document.getElementById("export-scope-select"),
  exportButton: document.getElementById("export-button"),
  videoGridToggle: document.getElementById("video-grid-toggle"),
  samplesTabButton: document.getElementById("samples-tab-button"),
  sourceVideosTabButton: document.getElementById("source-videos-tab-button"),
  rulesTabButton: document.getElementById("rules-tab-button"),
  samplesTabPanel: document.getElementById("samples-tab-panel"),
  sourceVideosTabPanel: document.getElementById("source-videos-tab-panel"),
  rulesTabPanel: document.getElementById("rules-tab-panel"),
  samplesWorkspaceGrid: document.getElementById("samples-workspace-grid"),
  sampleSidebarToggle: document.getElementById("sample-sidebar-toggle"),
  searchInput: document.getElementById("search-input"),
  sampleVisibilityFilter: document.getElementById("sample-visibility-filter"),
  shuffleButton: document.getElementById("shuffle-button"),
  showDeletedToggle: document.getElementById("show-deleted-toggle"),
  sampleCount: document.getElementById("sample-count"),
  sampleList: document.getElementById("sample-list"),
  sourceVideoSearchInput: document.getElementById("source-video-search-input"),
  sourceVideoCount: document.getElementById("source-video-count"),
  sourceVideoList: document.getElementById("source-video-list"),
  sourceSelectedKicker: document.getElementById("source-selected-kicker"),
  sourceSelectedTitle: document.getElementById("source-selected-title"),
  sourceLibraryPlayer: document.getElementById("source-library-player"),
  sourceTimelinePanel: document.getElementById("source-timeline-panel"),
  sourceTimelineSummary: document.getElementById("source-timeline-summary"),
  sourceTimelineTrack: document.getElementById("source-timeline-track"),
  sourceTimelineBlocks: document.getElementById("source-timeline-blocks"),
  sourceTimelineSelectedRange: document.getElementById("source-timeline-selected-range"),
  sourceTimelinePlayhead: document.getElementById("source-timeline-playhead"),
  sourceGridCalibrationPanel: document.getElementById("source-grid-calibration-panel"),
  sourceLibraryStatusBanner: document.getElementById("source-library-status-banner"),
  sourceLibraryMetadata: document.getElementById("source-library-metadata"),
  sourceExtractViolationType: document.getElementById("source-extract-violation-type"),
  sourceFootageStartTime: document.getElementById("source-footage-start-time"),
  sourceExtractStartClock: document.getElementById("source-extract-start-clock"),
  sourceExtractEndClock: document.getElementById("source-extract-end-clock"),
  sourceExtractStartFootageClock: document.getElementById("source-extract-start-footage-clock"),
  sourceExtractEndFootageClock: document.getElementById("source-extract-end-footage-clock"),
  sourceExtractStart: document.getElementById("source-extract-start"),
  sourceExtractEnd: document.getElementById("source-extract-end"),
  sourceExtractSetStart: document.getElementById("source-extract-set-start"),
  sourceExtractSetEnd: document.getElementById("source-extract-set-end"),
  sourceExtractReset: document.getElementById("source-extract-reset"),
  sourceExtractCreate: document.getElementById("source-extract-create"),
  sourceExtractStatus: document.getElementById("source-extract-status"),
  ruleSearchInput: document.getElementById("rule-search-input"),
  newRuleButton: document.getElementById("new-rule-button"),
  ruleCount: document.getElementById("rule-count"),
  ruleList: document.getElementById("rule-list"),
  ruleSelectedKicker: document.getElementById("rule-selected-kicker"),
  ruleSelectedTitle: document.getElementById("rule-selected-title"),
  rulesInfoPanel: document.getElementById("rules-info-panel"),
  ruleForm: document.getElementById("rule-form"),
  saveRuleFutureButton: document.getElementById("save-rule-future-button"),
  saveRuleRetroactiveButton: document.getElementById("save-rule-retroactive-button"),
  deleteRuleFutureButton: document.getElementById("delete-rule-future-button"),
  deleteRuleRetroactiveButton: document.getElementById("delete-rule-retroactive-button"),
  selectedKicker: document.getElementById("selected-kicker"),
  selectedTitle: document.getElementById("selected-title"),
  prevButton: document.getElementById("prev-button"),
  nextButton: document.getElementById("next-button"),
  copyAnnotationButton: document.getElementById("copy-annotation-button"),
  deleteButton: document.getElementById("delete-button"),
  clipPlayer: document.getElementById("clip-player"),
  gridCalibrationPanel: document.getElementById("grid-calibration-panel"),
  metadataPanel: document.getElementById("metadata-panel"),
  trimPanel: document.getElementById("trim-panel"),
  needsList: document.getElementById("needs-list"),
  qwenProviderSelect: document.getElementById("qwen-provider-select"),
  qwenEndpointInput: document.getElementById("qwen-endpoint-input"),
  qwenModelInput: document.getElementById("qwen-model-input"),
  qwenKeyframeCountInput: document.getElementById("qwen-keyframe-count-input"),
  batchDescriptionButton: document.getElementById("batch-description-button"),
  batchDescriptionDialog: document.getElementById("batch-description-dialog"),
  batchDescriptionSourceList: document.getElementById("batch-description-source-list"),
  batchDescriptionSelectAllButton: document.getElementById("batch-description-select-all-button"),
  batchDescriptionClearButton: document.getElementById("batch-description-clear-button"),
  batchDescriptionStartButton: document.getElementById("batch-description-start-button"),
  batchDescriptionCancelButton: document.getElementById("batch-description-cancel-button"),
  batchDescriptionStatus: document.getElementById("batch-description-status"),
  qwenGenerateButton: document.getElementById("qwen-generate-button"),
  qwenOldDescription: document.getElementById("qwen-old-description"),
  qwenDraftDescription: document.getElementById("qwen-draft-description"),
  qwenApplyButton: document.getElementById("qwen-apply-button"),
  qwenDiscardButton: document.getElementById("qwen-discard-button"),
  qwenStatus: document.getElementById("qwen-status"),
  qwenRequestSummary: document.getElementById("qwen-request-summary"),
  annotationForm: document.getElementById("annotation-form"),
};

function setSaveMessage(message) {
  state.saveMessage = message;
  elements.saveStatus.textContent = message;
}

function loadQwenSettings() {
  const fallback = {
    provider: "ollama",
    endpoint: QWEN_PROVIDER_DEFAULT_ENDPOINTS.ollama,
    model: "",
    keyframeCount: 5,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(QWEN_SETTINGS_KEY) || "{}");
    const provider = stored.provider === "lmstudio" ? "lmstudio" : "ollama";
    return {
      provider,
      endpoint: String(stored.endpoint || QWEN_PROVIDER_DEFAULT_ENDPOINTS[provider]),
      model: String(stored.model || ""),
      keyframeCount: Number(stored.keyframeCount || 5),
    };
  } catch {
    return fallback;
  }
}

function getQwenSettingsFromInputs() {
  const provider = elements.qwenProviderSelect.value === "lmstudio" ? "lmstudio" : "ollama";
  return {
    provider,
    endpoint: elements.qwenEndpointInput.value.trim() || QWEN_PROVIDER_DEFAULT_ENDPOINTS[provider],
    model: elements.qwenModelInput.value.trim(),
    keyframeCount: Number(elements.qwenKeyframeCountInput.value || 5),
  };
}

function saveQwenSettings() {
  localStorage.setItem(QWEN_SETTINGS_KEY, JSON.stringify(getQwenSettingsFromInputs()));
}

function renderQwenSettings() {
  const settings = loadQwenSettings();
  elements.qwenProviderSelect.value = settings.provider;
  elements.qwenEndpointInput.value = settings.endpoint;
  elements.qwenModelInput.value = settings.model;
  elements.qwenKeyframeCountInput.value = String(settings.keyframeCount || 5);
}

const VIDEO_GRID_LABELS = [
  "Top-Left",
  "Top-Center",
  "Top-Right",
  "Middle-Left",
  "Middle-Center",
  "Middle-Right",
  "Bottom-Left",
  "Bottom-Center",
  "Bottom-Right",
];

const POSITION_GRID_FIELDS = new Set(["entering_direction", "exiting_direction"]);

const DEFAULT_GRID_SETTINGS = {
  fill_x_percent: 100,
  fill_y_percent: 100,
  offset_x_px: 0,
  offset_y_px: 0,
};

const GRID_SETTING_CONTROLS = [
  { key: "fill_x_percent", label: "Stretch X", unit: "%", min: 25, max: 200, step: 1 },
  { key: "fill_y_percent", label: "Stretch Y", unit: "%", min: 25, max: 200, step: 1 },
  { key: "offset_x_px", label: "Offset X", unit: "px", min: -1000, max: 1000, step: 1 },
  { key: "offset_y_px", label: "Offset Y", unit: "px", min: -1000, max: 1000, step: 1 },
];

function videoGridOverlayMarkup() {
  return `<div class="video-grid-overlay" aria-hidden="true">${VIDEO_GRID_LABELS.map(
    (label) => `<span>${escapeHtml(label)}</span>`
  ).join("")}</div>`;
}

function applyVideoGridPreference() {
  document.body.classList.toggle("show-video-grid", state.showVideoGrid);
  elements.videoGridToggle.checked = state.showVideoGrid;
  requestAnimationFrame(updateVideoGridOverlaySizes);
}

function normalizeSourceVideoKey(value) {
  const rawValue = String(value || "").trim();
  if (!rawValue) {
    return "";
  }
  const fileName = rawValue.split("/").pop().replace(/\.[^.]+$/, "");
  const numericMatch = /^(\d+)$/.exec(fileName);
  return numericMatch ? `video_${numericMatch[1].padStart(3, "0")}` : fileName;
}

function sourceVideoKeyForSample(sample) {
  const sourcePath = String(sample?.source_video_path || "");
  return normalizeSourceVideoKey(sourcePath || sample?.video_id || "");
}

function getFootageStartTime(sourceVideoKey) {
  return state.sourceVideoFootageStartTimes[normalizeSourceVideoKey(sourceVideoKey)] || "";
}

function getFootageStartSeconds(sourceVideoKey) {
  const footageStartTime = getFootageStartTime(sourceVideoKey);
  if (!footageStartTime) {
    return null;
  }
  return parseClockToSeconds(footageStartTime);
}

function setFootageStartTimeState(sourceVideoKey, footageStartTime) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!normalizedKey) {
    return;
  }
  const normalizedTime = String(footageStartTime || "").trim();
  if (normalizedTime) {
    state.sourceVideoFootageStartTimes[normalizedKey] = normalizedTime;
  } else {
    delete state.sourceVideoFootageStartTimes[normalizedKey];
  }
}

function parseSampleTime(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
}

function sampleTimingInterval(sample) {
  const start =
    parseSampleTime(sample.clip_source_start_time) ??
    parseSampleTime(sample.start_time);
  const end =
    parseSampleTime(sample.clip_source_end_time) ??
    parseSampleTime(sample.end_time);
  if (start === null || end === null || end <= start) {
    return null;
  }
  return { start, end };
}

function getSourceVideoTimelineSamples(sourceVideoKey) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!normalizedKey) {
    return [];
  }
  return state.samples
    .map((sample) => {
      const interval = sampleTimingInterval(sample);
      if (!interval || sourceVideoKeyForSample(sample) !== normalizedKey) {
        return null;
      }
      return {
        sample,
        sampleId: sample.sample_id,
        clipName: String(sample.clip_path || sample.sample_id).split("/").pop(),
        violationType: displayViolationLabel(sample.violation_type || sample.clip_folder || "unknown"),
        isDeleted: Boolean(sample.is_deleted),
        isPublic: Boolean(sample.is_for_export),
        ...interval,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.start - right.start || left.end - right.end || left.clipName.localeCompare(right.clipName));
}

function assignTimelineLanes(intervals) {
  const laneEnds = [];
  return intervals.map((interval) => {
    let laneIndex = laneEnds.findIndex((laneEnd) => interval.start >= laneEnd);
    if (laneIndex === -1) {
      laneIndex = laneEnds.length;
      laneEnds.push(interval.end);
    } else {
      laneEnds[laneIndex] = interval.end;
    }
    return { ...interval, laneIndex };
  });
}

function getOverlappingSampleMap() {
  const groups = new Map();
  state.samples.forEach((sample) => {
    if (sample.is_deleted) {
      return;
    }
    const interval = sampleTimingInterval(sample);
    const sourceVideoKey = sourceVideoKeyForSample(sample);
    if (!interval || !sourceVideoKey) {
      return;
    }
    if (!groups.has(sourceVideoKey)) {
      groups.set(sourceVideoKey, []);
    }
    groups.get(sourceVideoKey).push({
      sampleId: sample.sample_id,
      clipName: String(sample.clip_path || sample.sample_id).split("/").pop(),
      ...interval,
    });
  });

  const overlappingSamples = new Map();
  const addOverlap = (source, target) => {
    if (!overlappingSamples.has(source.sampleId)) {
      overlappingSamples.set(source.sampleId, new Map());
    }
    overlappingSamples.get(source.sampleId).set(target.sampleId, target);
  };

  groups.forEach((intervals) => {
    intervals.sort((left, right) => left.start - right.start || left.end - right.end);
    intervals.forEach((current, index) => {
      for (let nextIndex = index + 1; nextIndex < intervals.length; nextIndex += 1) {
        const candidate = intervals[nextIndex];
        if (candidate.start >= current.end) {
          break;
        }
        if (current.start < candidate.end) {
          addOverlap(current, candidate);
          addOverlap(candidate, current);
        }
      }
    });
  });

  const overlapMap = new Map();
  overlappingSamples.forEach((matches, sampleId) => {
    overlapMap.set(
      sampleId,
      [...matches.values()].sort((left, right) => left.start - right.start || left.clipName.localeCompare(right.clipName))
    );
  });
  return overlapMap;
}

function getGridSettings(sourceVideoKey) {
  return {
    ...DEFAULT_GRID_SETTINGS,
    ...(state.sourceVideoGridSettings[normalizeSourceVideoKey(sourceVideoKey)] || {}),
  };
}

function setVideoGridFrameSourceKey(video, sourceVideoKey) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!video || !normalizedKey) {
    return;
  }
  video.dataset.sourceVideoKey = normalizedKey;
}

function updateVideoGridOverlaySizes() {
  document.querySelectorAll(".video-grid-frame").forEach((frame) => {
    const video = frame.querySelector("video");
    const overlay = frame.querySelector(".video-grid-overlay");
    if (!video || !overlay) {
      return;
    }

    const frameRect = frame.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const videoWidth = videoRect.width || frameRect.width;
    const videoHeight = videoRect.height || frameRect.height;
    if (!videoWidth || !videoHeight) {
      return;
    }

    const settings = getGridSettings(video.dataset.sourceVideoKey);
    const gridSize = Math.min(videoWidth, videoHeight);
    const gridWidth = gridSize * (settings.fill_x_percent / 100);
    const gridHeight = gridSize * (settings.fill_y_percent / 100);
    const left = videoRect.left - frameRect.left + (videoWidth - gridWidth) / 2 + settings.offset_x_px;
    const top = videoRect.top - frameRect.top + (videoHeight - gridHeight) / 2 + settings.offset_y_px;
    overlay.style.width = `${gridWidth}px`;
    overlay.style.height = `${gridHeight}px`;
    overlay.style.left = `${left}px`;
    overlay.style.top = `${top}px`;
  });
}

function bindVideoGridSizingEvents() {
  document.querySelectorAll(".video-grid-frame video").forEach((video) => {
    if (video.dataset.gridSizingBound === "true") {
      return;
    }
    video.dataset.gridSizingBound = "true";
    video.addEventListener("loadedmetadata", updateVideoGridOverlaySizes);
    video.addEventListener("loadeddata", updateVideoGridOverlaySizes);
  });
}

function queueGridSettingsSave(sourceVideoKey) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!normalizedKey) {
    return;
  }
  clearTimeout(state.gridSettingsSaveTimer);
  state.gridSettingsSaveTimer = setTimeout(async () => {
    try {
      const response = await fetch("/api/source-videos/grid-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_video_key: normalizedKey,
          settings: getGridSettings(normalizedKey),
        }),
      });
      const payload = await response.json().catch(() => ({ error: "Failed to save grid settings" }));
      if (!response.ok) {
        setSaveMessage(payload.error || "Failed to save grid settings");
        return;
      }
      state.sourceVideoGridSettings = payload.settings || state.sourceVideoGridSettings;
      setSaveMessage(`Grid calibration saved for ${normalizedKey}`);
    } catch {
      setSaveMessage("Failed to save grid settings");
    }
  }, 250);
}

function resetGridSettings(sourceVideoKey) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!normalizedKey) {
    return;
  }
  state.sourceVideoGridSettings[normalizedKey] = { ...DEFAULT_GRID_SETTINGS };
  renderGridCalibrationPanels();
  updateVideoGridOverlaySizes();
  queueGridSettingsSave(normalizedKey);
}

function renderGridCalibrationPanel(container, sourceVideoKey) {
  if (!container) {
    return;
  }
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!normalizedKey) {
    container.innerHTML = "";
    return;
  }

  const settings = getGridSettings(normalizedKey);
  const footageStartTime = getFootageStartTime(normalizedKey);
  container.innerHTML = `
    <div class="grid-calibration-header">
      <div>
        <h3>Grid Calibration</h3>
        <p>Saved for all clips from <code>${escapeHtml(normalizedKey)}</code>.</p>
      </div>
      <button class="secondary-button grid-calibration-reset" type="button">Reset</button>
    </div>
    <label class="footage-start-control">
      <span>Footage Start HH:MM:SS</span>
      <input class="source-footage-start-time" type="text" placeholder="HH:MM:SS" value="${escapeHtml(footageStartTime)}" />
    </label>
    <div class="grid-calibration-controls">
      ${GRID_SETTING_CONTROLS.map((control) => {
        const value = settings[control.key];
        return `
          <label class="grid-calibration-control">
            <span>${control.label}: <strong data-grid-setting-value="${control.key}">${formatGridSettingValue(value, control.unit)}</strong></span>
            <input
              type="range"
              min="${control.min}"
              max="${control.max}"
              step="${control.step}"
              value="${value}"
              data-grid-setting="${control.key}"
            />
          </label>
        `;
      }).join("")}
    </div>
  `;

  container.querySelector(".grid-calibration-reset")?.addEventListener("click", () => resetGridSettings(normalizedKey));
  const footageStartInput = container.querySelector(".source-footage-start-time");
  footageStartInput?.addEventListener("change", () => {
    const nextValue = footageStartInput.value.trim();
    if (nextValue && !isFootageStartTimeString(nextValue)) {
      footageStartInput.setCustomValidity("Use HH:MM:SS");
      footageStartInput.reportValidity();
      return;
    }
    footageStartInput.setCustomValidity("");
    setFootageStartTimeState(normalizedKey, nextValue);
    syncSourceExtractFootageClockFields();
    syncTrimFootageClockFields();
    renderGridCalibrationPanels();
    queueFootageStartTimeSave(normalizedKey, nextValue);
  });
  container.querySelectorAll("[data-grid-setting]").forEach((input) => {
    input.addEventListener("input", () => {
      const key = input.dataset.gridSetting;
      const control = GRID_SETTING_CONTROLS.find((item) => item.key === key);
      if (!key || !control) {
        return;
      }
      const value = Number(input.value);
      state.sourceVideoGridSettings[normalizedKey] = {
        ...getGridSettings(normalizedKey),
        [key]: value,
      };
      container.querySelector(`[data-grid-setting-value="${key}"]`).textContent = formatGridSettingValue(
        value,
        control.unit
      );
      updateVideoGridOverlaySizes();
      queueGridSettingsSave(normalizedKey);
    });
  });
}

function renderGridCalibrationPanels() {
  const selectedSample = getSelectedSample();
  renderGridCalibrationPanel(elements.gridCalibrationPanel, selectedSample ? sourceVideoKeyForSample(selectedSample) : "");
  const selectedSourceVideo = getSelectedSourceVideo();
  renderGridCalibrationPanel(
    elements.sourceGridCalibrationPanel,
    selectedSourceVideo ? selectedSourceVideo.source_video_key : ""
  );
}

function formatGridSettingValue(value, unit) {
  const numericValue = Number(value);
  const formatted = Number.isInteger(numericValue) ? String(numericValue) : numericValue.toFixed(1);
  return `${formatted}${unit}`;
}

function fieldLabel(fieldName) {
  const field = state.schema.fields.find((item) => item.name === fieldName);
  return field ? field.label : fieldName;
}

function displayViolationLabel(value) {
  return value === "pedestrian_crossing" ? "jaywalking" : value;
}

function normalizeViolationTypeForExport(value) {
  return (
    {
      crossing: "jaywalking",
      pedestrian_crossing: "jaywalking",
      lane_keeping: "lane_discipline",
      wrong_lane: "lane_use_control",
    }[value] || value
  );
}

function clipExportName(sample) {
  return String(sample.clip_export_name || sample.clip_path?.split("/").pop() || "");
}

function sampleLatexAnnotationValue(sample, sourceField) {
  if (sourceField === "clip_export_name") {
    return clipExportName(sample);
  }
  if (sourceField === "violation_type") {
    return normalizeViolationTypeForExport(sample[sourceField] || "");
  }
  return sample[sourceField] || "";
}

function escapeLatexText(value) {
  const replacements = {
    "\\": "\\textbackslash{}",
    "{": "\\{",
    "}": "\\}",
    "_": "\\_",
    "%": "\\%",
    "&": "\\&",
    "#": "\\#",
    "$": "\\$",
    "^": "\\^{}",
    "~": "\\~{}",
  };
  return String(value).replace(/[\\{}_%&#$^~]/g, (character) => replacements[character]);
}

function escapeLatexJsonString(value) {
  const jsonValue = JSON.stringify(String(value ?? ""));
  return escapeLatexText(jsonValue.slice(1, -1));
}

function wrapLatexAnnotationLine(line) {
  if (line.length <= LATEX_ANNOTATION_WRAP_COLUMN) {
    return [line];
  }

  const segments = [];
  let remaining = line;
  while (remaining.length > LATEX_ANNOTATION_WRAP_COLUMN) {
    let breakIndex = remaining.lastIndexOf(" ", LATEX_ANNOTATION_WRAP_COLUMN);
    if (breakIndex <= 0) {
      breakIndex = LATEX_ANNOTATION_WRAP_COLUMN;
    }
    segments.push(remaining.slice(0, breakIndex));
    remaining = remaining.slice(breakIndex).trimStart();
  }
  if (remaining) {
    segments.push(remaining);
  }
  return segments;
}

function formatLatexAnnotationEntry(key, value, isLast) {
  const suffix = isLast ? "" : ",";
  const line = `"${escapeLatexText(key)}": "${escapeLatexJsonString(value)}"${suffix}`;
  return wrapLatexAnnotationLine(line)
    .map((segment) => `    \\hspace*{1em}${segment}\\\\`)
    .join("\n");
}

function formatSampleLatexAnnotation(sample) {
  const entries = LATEX_ANNOTATION_FIELDS.map(([key, sourceField], index) =>
    formatLatexAnnotationEntry(
      key,
      sampleLatexAnnotationValue(sample, sourceField),
      index === LATEX_ANNOTATION_FIELDS.length - 1
    )
  );
  return [
    "\\fbox{%",
    "    \\begin{minipage}{0.96\\linewidth}",
    "    \\scriptsize\\ttfamily",
    "    \\{\\\\",
    ...entries,
    "    \\}",
    "    \\end{minipage}",
    "    }",
  ].join("\n");
}

function copyTextWithHiddenTextarea(text) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "-1000px";
  textarea.style.left = "-1000px";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Clipboard copy was rejected");
    }
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error);
  } finally {
    textarea.remove();
  }
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back for localhost/browser contexts that expose Clipboard but deny writeText.
    }
  }
  await copyTextWithHiddenTextarea(text);
}

async function copySelectedAnnotationAsLatex() {
  const sample = getSelectedSample();
  if (!sample) {
    return;
  }

  const label = elements.copyAnnotationButton.textContent;
  elements.copyAnnotationButton.disabled = true;
  try {
    await copyTextToClipboard(formatSampleLatexAnnotation(sample));
    elements.copyAnnotationButton.textContent = "Copied";
    setSaveMessage("Copied LaTeX annotation");
    window.setTimeout(() => {
      elements.copyAnnotationButton.textContent = label;
      elements.copyAnnotationButton.disabled = !getSelectedSample();
    }, 1200);
  } catch (error) {
    elements.copyAnnotationButton.textContent = label;
    elements.copyAnnotationButton.disabled = false;
    setSaveMessage(`Failed to copy annotation: ${error.message || "clipboard unavailable"}`);
  }
}

function isHiddenFieldOption(fieldName, option) {
  return HIDDEN_FIELD_OPTIONS[fieldName]?.has(option) || false;
}

function getMissingFields(sample) {
  return state.schema.editable_fields.filter((field) => !String(sample[field] || "").trim());
}

function getFilledFields(sample) {
  return state.schema.editable_fields.filter((field) => String(sample[field] || "").trim());
}

function sampleListSortTime(sample) {
  const annotationTime = parseClockToSeconds(sample.time);
  if (annotationTime !== null) {
    return annotationTime;
  }
  const interval = sampleTimingInterval(sample);
  return interval ? interval.start : Number.POSITIVE_INFINITY;
}

function compareSamplesBySourceAndTime(left, right) {
  const leftSource = sourceVideoKeyForSample(left);
  const rightSource = sourceVideoKeyForSample(right);
  const sourceComparison = leftSource.localeCompare(rightSource, undefined, { numeric: true });
  if (sourceComparison !== 0) {
    return sourceComparison;
  }

  const timeComparison = sampleListSortTime(left) - sampleListSortTime(right);
  if (timeComparison !== 0) {
    return timeComparison;
  }

  const leftName = String(left.clip_path || left.sample_id || "");
  const rightName = String(right.clip_path || right.sample_id || "");
  return leftName.localeCompare(rightName, undefined, { numeric: true });
}

function getVisibleSamples() {
  const query = state.search.trim().toLowerCase();
  return state.samples
    .filter((sample) => {
      if (!state.showDeleted && sample.is_deleted) {
        return false;
      }
      if (!sampleMatchesVisibilityScope(sample, state.sampleVisibilityScope)) {
        return false;
      }
      if (!query) {
        return true;
      }

      const haystack = [
        sample.sample_id,
        sample.clip_path,
        sample.clip_folder,
        sample.video_id,
        sample.violation_type,
        sample.violator_type,
        sample.description,
        sample.mapping_status,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    })
    .sort(compareSamplesBySourceAndTime);
}

function getVisibleSourceVideos() {
  const query = state.sourceVideoSearch.trim().toLowerCase();
  return state.sourceVideos.filter((video) => {
    if (!query) {
      return true;
    }
    const haystack = [video.source_video_key, video.video_id, video.source_video_path, video.file_name].join(" ").toLowerCase();
    return haystack.includes(query);
  });
}

function getSelectedSample() {
  return state.samples.find((sample) => sample.sample_id === state.selectedId) || null;
}

function getSelectedSourceVideo() {
  return state.sourceVideos.find((video) => video.source_video_key === state.selectedSourceVideoKey) || null;
}

function getVisibleRules() {
  const query = state.ruleSearch.trim().toLowerCase();
  return state.rules.filter((rule) => {
    if (!query) {
      return true;
    }
    const haystack = [
      rule.label,
      rule.field_name,
      rule.value,
      rule.conditions?.video_id,
      rule.conditions?.violation_type,
      rule.conditions?.violator_type,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function getSelectedRule() {
  if (state.selectedRuleId === "__new__") {
    return {
      id: "__new__",
      label: "",
      field_name: "intersection_type",
      value: "",
      conditions: {},
    };
  }
  return state.rules.find((rule) => rule.id === state.selectedRuleId) || null;
}

function updateSourceVideoPositionState(sourceVideoKey, positionSeconds) {
  const index = state.sourceVideos.findIndex((video) => video.source_video_key === sourceVideoKey);
  if (index >= 0) {
    state.sourceVideos[index].last_position_seconds = positionSeconds;
  }
}

function updateSummaryFromSamples() {
  const activeSamples = state.samples.filter((sample) => !sample.is_deleted);
  state.summary = {
    total: activeSamples.length,
    for_export: activeSamples.filter((sample) => sample.is_for_export).length,
    secret: activeSamples.filter((sample) => !sample.is_for_export).length,
    annotated: activeSamples.filter((sample) => getMissingFields(sample).length === 0).length,
    complete_except_description: activeSamples.filter((sample) => {
      const missingFields = getMissingFields(sample);
      return missingFields.length === 1 && missingFields[0] === "description";
    }).length,
    missing_fields: activeSamples.reduce((count, sample) => count + getMissingFields(sample).length, 0),
    deleted: state.samples.filter((sample) => sample.is_deleted).length,
    ambiguous: state.samples.filter((sample) => sample.mapping_status === "ambiguous").length,
    unlinked: state.samples.filter((sample) => sample.mapping_status === "unlinked").length,
  };
}

function shuffleSamples() {
  for (let index = state.samples.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [state.samples[index], state.samples[swapIndex]] = [state.samples[swapIndex], state.samples[index]];
  }
  ensureSelection();
  render();
  setSaveMessage("Sample list shuffled");
}

function sampleMatchesVisibilityScope(sample, scope) {
  if (scope === "both") {
    return true;
  }
  const isPublic = Boolean(sample.is_for_export);
  if (scope === "public") {
    return isPublic;
  }
  return !isPublic;
}

function countByField(fieldName, options = {}) {
  const visibilityScope = options.visibilityScope || "both";
  const completeOnly = Boolean(options.completeOnly);
  const counts = new Map();
  state.samples
    .filter((sample) => !sample.is_deleted)
    .filter((sample) => sampleMatchesVisibilityScope(sample, visibilityScope))
    .filter((sample) => !completeOnly || getMissingFields(sample).length === 0)
    .forEach((sample) => {
      const key = String(sample[fieldName] || "(empty)");
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
}

function countViolationTypesByVideo(options = {}) {
  const visibilityScope = options.visibilityScope || "both";
  const completeOnly = Boolean(options.completeOnly);
  const grouped = new Map();
  state.samples
    .filter((sample) => !sample.is_deleted)
    .filter((sample) => sampleMatchesVisibilityScope(sample, visibilityScope))
    .filter((sample) => !completeOnly || getMissingFields(sample).length === 0)
    .forEach((sample) => {
      const videoId = String(sample.video_id || "(unknown)");
      const violationType = String(sample.violation_type || "(empty)");
      if (!grouped.has(videoId)) {
        grouped.set(videoId, { total: 0, publicCount: 0, secretCount: 0, counts: new Map() });
      }
      const entry = grouped.get(videoId);
      entry.total += 1;
      if (sample.is_for_export) {
        entry.publicCount += 1;
      } else {
        entry.secretCount += 1;
      }
      entry.counts.set(violationType, (entry.counts.get(violationType) || 0) + 1);
    });

  return [...grouped.entries()]
    .map(([videoId, entry]) => [
      videoId,
      {
        total: entry.total,
        visibility:
          entry.publicCount === entry.total ? "public" : entry.secretCount === entry.total ? "secret" : "mixed",
        counts: [...entry.counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
      },
    ])
    .sort((left, right) => right[1].total - left[1].total || left[0].localeCompare(right[0]));
}

function mediaUrlForPath(relativePath) {
  return `/media/${relativePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function browserSourceUrlForKey(sourceVideoKey) {
  return `/api/source-videos/${encodeURIComponent(sourceVideoKey)}.mp4`;
}

function browserSourceUrl(sample) {
  const sourcePath = String(sample.source_video_path || "");
  const sourceKey = sourceVideoKeyForSample(sample);
  return browserSourceUrlForKey(sourceKey);
}

function formatSeconds(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return "Unknown";
  }
  return numeric.toFixed(3);
}

function formatBytes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return "Unknown";
  }
  if (numeric < 1024) {
    return `${numeric} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = numeric / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  const precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(precision)} ${units[unitIndex]}`;
}

function formatSecondsToClock(value, includeMilliseconds = false) {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    return "";
  }
  const totalSeconds = Math.floor(numeric);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const base = `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  if (!includeMilliseconds) {
    return base;
  }
  const milliseconds = Math.round((numeric - totalSeconds) * 1000);
  const normalizedMilliseconds = milliseconds === 1000 ? 999 : milliseconds;
  return `${base}.${String(normalizedMilliseconds).padStart(3, "0")}`;
}

function formatSecondsToFootageClock(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    return "";
  }
  const totalSeconds = Math.floor(numeric);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function isFootageStartTimeString(value) {
  const trimmed = String(value || "").trim();
  if (!/^\d{2}:[0-5]\d:[0-5]\d$/.test(trimmed)) {
    return false;
  }
  const hours = Number(trimmed.slice(0, 2));
  return hours <= 23;
}

function parseClockToSeconds(value, allowMilliseconds = false) {
  const trimmed = String(value || "").trim();
  const pattern = allowMilliseconds
    ? /^(\d+):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/
    : /^(\d+):([0-5]\d):([0-5]\d)$/;
  const match = pattern.exec(trimmed);
  if (!match) {
    return null;
  }
  const [, hours, minutes, seconds, milliseconds = "0"] = match;
  const fractionalSeconds = allowMilliseconds ? Number(milliseconds.padEnd(3, "0")) / 1000 : 0;
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + fractionalSeconds;
}

function syncClockField(secondsInput, clockInput, includeMilliseconds = false) {
  if (!secondsInput || !clockInput) {
    return;
  }
  clockInput.value = formatSecondsToClock(secondsInput.value, includeMilliseconds);
  clockInput.setCustomValidity("");
}

function syncSecondsField(secondsInput, clockInput, allowMilliseconds = false) {
  if (!secondsInput || !clockInput) {
    return false;
  }
  const parsed = parseClockToSeconds(clockInput.value, allowMilliseconds);
  if (parsed === null) {
    clockInput.setCustomValidity(allowMilliseconds ? "Use H:MM:SS.mmm" : "Use H:MM:SS");
    clockInput.reportValidity();
    return false;
  }
  clockInput.setCustomValidity("");
  secondsInput.value = allowMilliseconds ? parsed.toFixed(3) : parsed;
  return true;
}

function syncFootageClockField(secondsInput, footageClockInput, sourceVideoKey) {
  if (!secondsInput || !footageClockInput) {
    return;
  }
  const footageStartSeconds = getFootageStartSeconds(sourceVideoKey);
  const relativeSeconds = Number(secondsInput.value);
  if (footageStartSeconds === null || !Number.isFinite(relativeSeconds)) {
    footageClockInput.value = "";
    footageClockInput.placeholder = footageStartSeconds === null ? "Set footage start" : "HH:MM:SS";
    footageClockInput.setCustomValidity("");
    return;
  }
  footageClockInput.placeholder = "HH:MM:SS";
  footageClockInput.value = formatSecondsToFootageClock(footageStartSeconds + relativeSeconds);
  footageClockInput.setCustomValidity("");
}

function syncSecondsFromFootageClock(secondsInput, footageClockInput, sourceVideoKey) {
  if (!secondsInput || !footageClockInput) {
    return false;
  }
  const footageStartSeconds = getFootageStartSeconds(sourceVideoKey);
  if (footageStartSeconds === null) {
    footageClockInput.setCustomValidity("Set footage start time first");
    footageClockInput.reportValidity();
    return false;
  }
  const parsed = parseClockToSeconds(footageClockInput.value);
  if (parsed === null) {
    footageClockInput.setCustomValidity("Use HH:MM:SS");
    footageClockInput.reportValidity();
    return false;
  }
  const relativeSeconds = parsed - footageStartSeconds;
  if (relativeSeconds < 0) {
    footageClockInput.setCustomValidity("Footage time is before the saved footage start");
    footageClockInput.reportValidity();
    return false;
  }
  footageClockInput.setCustomValidity("");
  secondsInput.value = relativeSeconds.toFixed(3);
  return true;
}

function syncTrimClockField(fieldName) {
  const secondsInput = document.getElementById(`trim-${fieldName}`);
  const clockInput = document.getElementById(`trim-${fieldName}-clock`);
  const footageClockInput = document.getElementById(`trim-${fieldName}-footage-clock`);
  const selectedSample = getSelectedSample();
  syncClockField(secondsInput, clockInput);
  syncFootageClockField(secondsInput, footageClockInput, selectedSample ? sourceVideoKeyForSample(selectedSample) : "");
}

function syncTrimSecondsField(fieldName) {
  const secondsInput = document.getElementById(`trim-${fieldName}`);
  const clockInput = document.getElementById(`trim-${fieldName}-clock`);
  const synced = syncSecondsField(secondsInput, clockInput);
  if (synced) {
    syncTrimClockField(fieldName);
  }
  return synced;
}

function syncTrimSecondsFromFootageField(fieldName) {
  const secondsInput = document.getElementById(`trim-${fieldName}`);
  const clockInput = document.getElementById(`trim-${fieldName}-clock`);
  const footageClockInput = document.getElementById(`trim-${fieldName}-footage-clock`);
  const selectedSample = getSelectedSample();
  const synced = syncSecondsFromFootageClock(
    secondsInput,
    footageClockInput,
    selectedSample ? sourceVideoKeyForSample(selectedSample) : ""
  );
  if (synced) {
    syncClockField(secondsInput, clockInput);
  }
  return synced;
}

function syncTrimFootageClockFields() {
  syncTrimClockField("start");
  syncTrimClockField("end");
}

function seekSourcePlayerToClipStart(sample) {
  const player = document.getElementById("source-video-player");
  if (!player) {
    return;
  }

  const clipStart = Number(sample.clip_source_start_time ?? sample.start_time ?? 0);
  if (Number.isNaN(clipStart) || clipStart < 0) {
    return;
  }

  const seekToStart = () => {
    const duration = Number(player.duration);
    if (Number.isFinite(duration) && duration > 0) {
      player.currentTime = Math.min(clipStart, Math.max(duration - 0.05, 0));
    } else {
      player.currentTime = clipStart;
    }
  };

  if (player.readyState >= 1) {
    seekToStart();
  } else {
    player.addEventListener("loadedmetadata", seekToStart, { once: true });
  }
}

function isSourcePlayerLoaded() {
  const player = document.getElementById("source-video-player");
  return Boolean(player?.dataset.loaded === "true");
}

function loadSourceVideo(sample) {
  const player = document.getElementById("source-video-player");
  const loadButton = document.getElementById("trim-load-source");
  if (!player) {
    return;
  }
  setVideoGridFrameSourceKey(player, sourceVideoKeyForSample(sample));

  if (isSourcePlayerLoaded()) {
    seekSourcePlayerToClipStart(sample);
    return;
  }

  if (loadButton) {
    loadButton.disabled = true;
    loadButton.textContent = "Loading Source Video…";
  }
  setSaveMessage("Loading source video…");

  const handleLoaded = () => {
    player.dataset.loaded = "true";
    if (loadButton) {
      loadButton.textContent = "Source Video Loaded";
    }
    seekSourcePlayerToClipStart(sample);
    updateVideoGridOverlaySizes();
    setSaveMessage("Source video loaded");
  };

  const handleError = () => {
    player.dataset.loaded = "false";
    if (loadButton) {
      loadButton.disabled = false;
      loadButton.textContent = "Load Source Video";
    }
    setSaveMessage("Failed to load source video");
  };

  player.addEventListener("loadedmetadata", handleLoaded, { once: true });
  player.addEventListener("error", handleError, { once: true });
  setVideoGridFrameSourceKey(player, sourceVideoKeyForSample(sample));
  player.src = browserSourceUrl(sample);
  player.load();
}

function renderSummary() {
  const entries = [
    ["Total Samples", state.summary.total],
    ["Public", state.summary.for_export],
    ["Secret", state.summary.secret],
    ["Complete", state.summary.annotated],
    ["Complete Except Description", state.summary.complete_except_description],
    ["Missing Fields", state.summary.missing_fields],
  ];
  elements.summaryGrid.innerHTML = "";
  entries.forEach(([label, value]) => {
    const card = document.createElement("div");
    card.className = "summary-card";
    card.innerHTML = `<p>${label}</p><strong>${value}</strong>`;
    elements.summaryGrid.appendChild(card);
  });
}

function ensureSourceVideoSelection() {
  const visible = getVisibleSourceVideos();
  if (!visible.length) {
    state.selectedSourceVideoKey = null;
    return;
  }
  if (!visible.some((video) => video.source_video_key === state.selectedSourceVideoKey)) {
    state.selectedSourceVideoKey = visible[0].source_video_key;
  }
}

function renderWorkspaceTabs() {
  const showSamples = state.activeWorkspaceTab === "samples";
  const showSourceVideos = state.activeWorkspaceTab === "source-videos";
  const showRules = state.activeWorkspaceTab === "rules";
  elements.samplesTabButton.classList.toggle("is-active", showSamples);
  elements.samplesTabButton.setAttribute("aria-selected", showSamples ? "true" : "false");
  elements.sourceVideosTabButton.classList.toggle("is-active", showSourceVideos);
  elements.sourceVideosTabButton.setAttribute("aria-selected", showSourceVideos ? "true" : "false");
  elements.rulesTabButton.classList.toggle("is-active", showRules);
  elements.rulesTabButton.setAttribute("aria-selected", showRules ? "true" : "false");
  elements.samplesTabPanel.hidden = !showSamples;
  elements.sourceVideosTabPanel.hidden = !showSourceVideos;
  elements.rulesTabPanel.hidden = !showRules;
}

function renderSampleSidebarState() {
  elements.samplesWorkspaceGrid.classList.toggle("is-sample-sidebar-collapsed", state.sampleSidebarCollapsed);
  elements.sampleSidebarToggle.textContent = state.sampleSidebarCollapsed ? "Show List" : "Collapse List";
  elements.sampleSidebarToggle.setAttribute("aria-expanded", state.sampleSidebarCollapsed ? "false" : "true");
}

function renderSourceVideoList() {
  const videos = getVisibleSourceVideos();
  elements.sourceVideoCount.textContent = `${videos.length} visible source videos`;
  elements.sourceVideoList.innerHTML = "";

  if (!videos.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No source videos match the current filter.";
    elements.sourceVideoList.appendChild(empty);
    return;
  }

  videos.forEach((video) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sample-card";
    if (video.source_video_key === state.selectedSourceVideoKey) {
      item.classList.add("is-selected");
    }
    item.innerHTML = `
      <div class="sample-card-header">
        <h3>${escapeHtml(video.file_name)}</h3>
      </div>
      <p class="sample-card-subtitle">${escapeHtml(video.source_video_path)}</p>
      <div class="badge-row">
        <span class="badge workspace">source video</span>
        <span class="badge pending">${escapeHtml(video.video_id)}</span>
      </div>
    `;
    item.addEventListener("click", async () => {
      const currentVideo = getSelectedSourceVideo();
      if (
        currentVideo &&
        currentVideo.source_video_key !== video.source_video_key &&
        sourceVideoPlayerCanPersist(currentVideo.source_video_key)
      ) {
        await persistSourceVideoPosition(currentVideo.source_video_key, elements.sourceLibraryPlayer.currentTime || 0).catch(
          () => {}
        );
      }
      state.selectedSourceVideoKey = video.source_video_key;
      render();
    });
    elements.sourceVideoList.appendChild(item);
  });
}

function resetSourceExtractInputs() {
  const player = elements.sourceLibraryPlayer;
  const duration = Number(player?.duration || 0);
  elements.sourceExtractStart.value = 0;
  elements.sourceExtractEnd.value = Number.isFinite(duration) && duration > 0 ? duration.toFixed(3) : 0;
  syncClockField(elements.sourceExtractStart, elements.sourceExtractStartClock, true);
  syncClockField(elements.sourceExtractEnd, elements.sourceExtractEndClock, true);
  syncSourceExtractFootageClockFields();
  updateSourceTimelineExtractionRange();
}

function syncSourceExtractFootageClockFields() {
  const video = getSelectedSourceVideo();
  const sourceVideoKey = video ? video.source_video_key : "";
  syncFootageClockField(elements.sourceExtractStart, elements.sourceExtractStartFootageClock, sourceVideoKey);
  syncFootageClockField(elements.sourceExtractEnd, elements.sourceExtractEndFootageClock, sourceVideoKey);
}

function syncSourceExtractSecondsFromFootage(fieldName) {
  const input = fieldName === "start" ? elements.sourceExtractStart : elements.sourceExtractEnd;
  const relativeClock = fieldName === "start" ? elements.sourceExtractStartClock : elements.sourceExtractEndClock;
  const footageClock =
    fieldName === "start" ? elements.sourceExtractStartFootageClock : elements.sourceExtractEndFootageClock;
  const video = getSelectedSourceVideo();
  const synced = syncSecondsFromFootageClock(input, footageClock, video ? video.source_video_key : "");
  if (synced) {
    syncClockField(input, relativeClock, true);
  }
  return synced;
}

function getSourceTimelineDuration() {
  const playerDuration = Number(elements.sourceLibraryPlayer?.duration);
  if (Number.isFinite(playerDuration) && playerDuration > 0) {
    return playerDuration;
  }
  const selectedEnd = Number(elements.sourceExtractEnd?.value);
  const maxIntervalEnd = Math.max(
    0,
    ...getSourceVideoTimelineSamples(state.selectedSourceVideoKey).map((interval) => interval.end)
  );
  return Math.max(Number.isFinite(selectedEnd) ? selectedEnd : 0, maxIntervalEnd);
}

function sourceTimelinePercent(seconds, duration = getSourceTimelineDuration()) {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (seconds / duration) * 100));
}

function updateSourceTimelinePlayhead() {
  const duration = getSourceTimelineDuration();
  const currentTime = Number(elements.sourceLibraryPlayer?.currentTime || 0);
  elements.sourceTimelinePlayhead.style.left = `${sourceTimelinePercent(currentTime, duration)}%`;
}

function updateSourceTimelineExtractionRange() {
  const duration = getSourceTimelineDuration();
  const start = Number(elements.sourceExtractStart.value);
  const end = Number(elements.sourceExtractEnd.value);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !duration) {
    elements.sourceTimelineSelectedRange.hidden = true;
    return;
  }
  const left = sourceTimelinePercent(start, duration);
  const right = sourceTimelinePercent(end, duration);
  elements.sourceTimelineSelectedRange.hidden = false;
  elements.sourceTimelineSelectedRange.style.left = `${left}%`;
  elements.sourceTimelineSelectedRange.style.width = `${Math.max(0.2, right - left)}%`;
}

function timelineClientXToSeconds(event) {
  const duration = getSourceTimelineDuration();
  const rect = elements.sourceTimelineTrack.getBoundingClientRect();
  if (!Number.isFinite(duration) || duration <= 0 || rect.width <= 0) {
    return null;
  }
  const position = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
  return Number((position * duration).toFixed(3));
}

function setSourceExtractionRange(start, end) {
  const duration = getSourceTimelineDuration();
  const boundedStart = Math.max(0, Math.min(start, duration || start));
  const boundedEnd = Math.max(0, Math.min(end, duration || end));
  const nextStart = Math.min(boundedStart, boundedEnd);
  const nextEnd = Math.max(boundedStart, boundedEnd);
  elements.sourceExtractStart.value = nextStart.toFixed(3);
  elements.sourceExtractEnd.value = nextEnd.toFixed(3);
  syncClockField(elements.sourceExtractStart, elements.sourceExtractStartClock, true);
  syncClockField(elements.sourceExtractEnd, elements.sourceExtractEndClock, true);
  syncSourceExtractFootageClockFields();
  updateSourceTimelineExtractionRange();
}

async function selectSampleFromTimeline(sampleId) {
  const sample = state.samples.find((item) => item.sample_id === sampleId);
  if (!sample) {
    return;
  }
  state.selectedId = sampleId;
  state.search = "";
  elements.searchInput.value = "";
  state.sampleVisibilityScope = "both";
  elements.sampleVisibilityFilter.value = "both";
  if (sample.is_deleted) {
    state.showDeleted = true;
    elements.showDeletedToggle.checked = true;
  }
  state.activeWorkspaceTab = "samples";
  ensureSelection();
  render();
}

function beginSourceTimelineDrag(event) {
  if (event.target.closest(".source-timeline-block")) {
    return;
  }
  const startSeconds = timelineClientXToSeconds(event);
  if (startSeconds === null) {
    return;
  }
  state.sourceTimelineDrag = {
    pointerId: event.pointerId,
    startSeconds,
    hasMoved: false,
  };
  elements.sourceTimelineTrack.setPointerCapture(event.pointerId);
  const player = elements.sourceLibraryPlayer;
  if (player) {
    player.currentTime = startSeconds;
  }
  updateSourceTimelinePlayhead();
  event.preventDefault();
}

function moveSourceTimelineDrag(event) {
  const drag = state.sourceTimelineDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  const currentSeconds = timelineClientXToSeconds(event);
  if (currentSeconds === null) {
    return;
  }
  if (Math.abs(currentSeconds - drag.startSeconds) >= 0.05) {
    drag.hasMoved = true;
  }
  setSourceExtractionRange(drag.startSeconds, currentSeconds);
}

function endSourceTimelineDrag(event) {
  const drag = state.sourceTimelineDrag;
  if (!drag || drag.pointerId !== event.pointerId) {
    return;
  }
  const endSeconds = timelineClientXToSeconds(event) ?? drag.startSeconds;
  const player = elements.sourceLibraryPlayer;
  if (player) {
    player.currentTime = endSeconds;
  }
  if (!drag.hasMoved) {
    updateSourceTimelineExtractionRange();
  } else {
    setSourceExtractionRange(drag.startSeconds, endSeconds);
  }
  updateSourceTimelinePlayhead();
  if (elements.sourceTimelineTrack.hasPointerCapture(event.pointerId)) {
    elements.sourceTimelineTrack.releasePointerCapture(event.pointerId);
  }
  state.sourceTimelineDrag = null;
}

function renderSourceVideoTimeline() {
  const video = getSelectedSourceVideo();
  const duration = getSourceTimelineDuration();
  const intervals = video ? getSourceVideoTimelineSamples(video.source_video_key) : [];
  const laneIntervals = assignTimelineLanes(intervals);
  const laneCount = Math.max(1, ...laneIntervals.map((interval) => interval.laneIndex + 1));

  elements.sourceTimelineTrack.style.setProperty("--timeline-lanes", laneCount);
  elements.sourceTimelineBlocks.innerHTML = "";

  if (!video) {
    elements.sourceTimelineSummary.textContent = "Load a source video to inspect occupied intervals.";
    updateSourceTimelineExtractionRange();
    updateSourceTimelinePlayhead();
    return;
  }

  elements.sourceTimelineSummary.textContent = duration
    ? `${intervals.length} occupied interval${intervals.length === 1 ? "" : "s"} across ${formatSecondsToClock(duration, true)}. Drag empty space to set a new extraction range.`
    : `${intervals.length} occupied interval${intervals.length === 1 ? "" : "s"}. Load metadata to align intervals to the full duration.`;

  laneIntervals.forEach((interval) => {
    if (!duration) {
      return;
    }
    const block = document.createElement("button");
    block.type = "button";
    block.className = `source-timeline-block${interval.isDeleted ? " is-deleted" : ""}`;
    block.dataset.sampleId = interval.sampleId;
    block.style.left = `${sourceTimelinePercent(interval.start, duration)}%`;
    block.style.width = `${Math.max(0.35, sourceTimelinePercent(interval.end, duration) - sourceTimelinePercent(interval.start, duration))}%`;
    block.style.top = `calc(${interval.laneIndex} * var(--timeline-lane-height) + 0.35rem)`;
    block.title = `${interval.clipName}\n${interval.violationType} | ${interval.isPublic ? "Public" : "Secret"}${interval.isDeleted ? " | Deleted" : ""}\n${formatSeconds(interval.start)}s - ${formatSeconds(interval.end)}s`;
    block.innerHTML = `<span>${escapeHtml(interval.violationType)}</span>`;
    block.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectSampleFromTimeline(interval.sampleId);
    });
    elements.sourceTimelineBlocks.appendChild(block);
  });

  updateSourceTimelineExtractionRange();
  updateSourceTimelinePlayhead();
}

async function persistSourceVideoPosition(sourceVideoKey, positionSeconds, useBeacon = false) {
  const rounded = Number(Number(positionSeconds || 0).toFixed(3));
  updateSourceVideoPositionState(sourceVideoKey, rounded);
  const payload = JSON.stringify({
    source_video_key: sourceVideoKey,
    position_seconds: rounded,
  });

  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/api/source-videos/position", blob);
    return;
  }

  await fetch("/api/source-videos/position", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: useBeacon,
  });
}

function queueFootageStartTimeSave(sourceVideoKey, footageStartTime) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  if (!normalizedKey) {
    return;
  }
  clearTimeout(state.footageStartTimeSaveTimer);
  state.footageStartTimeSaveTimer = setTimeout(async () => {
    const normalizedTime = String(footageStartTime || "").trim();
    if (normalizedTime && !isFootageStartTimeString(normalizedTime)) {
      setSaveMessage("Footage start time must use HH:MM:SS");
      return;
    }
    setFootageStartTimeState(normalizedKey, normalizedTime);
    syncSourceExtractFootageClockFields();
    syncTrimFootageClockFields();
    renderGridCalibrationPanels();
    try {
      const response = await fetch("/api/source-videos/footage-start-time", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_video_key: normalizedKey,
          footage_start_time: normalizedTime,
        }),
      });
      const payload = await response.json().catch(() => ({ error: "Failed to save footage start time" }));
      if (!response.ok) {
        setSaveMessage(payload.error || "Failed to save footage start time");
        return;
      }
      state.sourceVideoFootageStartTimes = payload.start_times || state.sourceVideoFootageStartTimes;
      setSaveMessage(normalizedTime ? `Footage start saved for ${normalizedKey}` : `Footage start cleared for ${normalizedKey}`);
    } catch {
      setSaveMessage("Failed to save footage start time");
    }
  }, 250);
}

function sourceVideoPlayerCanPersist(sourceVideoKey) {
  const player = elements.sourceLibraryPlayer;
  if (!player) {
    return false;
  }
  return (
    player.dataset.loaded === "true" &&
    player.dataset.sourceVideoKey === sourceVideoKey &&
    Number.isFinite(player.currentTime)
  );
}

function queueSourceVideoPositionSave() {
  const video = getSelectedSourceVideo();
  const player = elements.sourceLibraryPlayer;
  if (!video || !player || !sourceVideoPlayerCanPersist(video.source_video_key)) {
    return;
  }
  if (state.sourceVideoPositionSaveTimer) {
    clearTimeout(state.sourceVideoPositionSaveTimer);
  }
  state.sourceVideoPositionSaveTimer = setTimeout(() => {
    persistSourceVideoPosition(video.source_video_key, player.currentTime).catch(() => {});
    state.sourceVideoPositionSaveTimer = null;
  }, 1200);
}

function restoreSourceVideoPosition(video) {
  const player = elements.sourceLibraryPlayer;
  if (!player || !video) {
    return;
  }
  const savedPosition = Number(video.last_position_seconds || 0);
  if (!Number.isFinite(savedPosition) || savedPosition <= 0) {
    return;
  }
  const duration = Number(player.duration);
  if (Number.isFinite(duration) && duration > 0) {
    player.currentTime = Math.min(savedPosition, Math.max(duration - 0.05, 0));
    return;
  }
  player.currentTime = savedPosition;
}

function setSourceExtractInputFromPlayer(fieldName) {
  const player = elements.sourceLibraryPlayer;
  const input = fieldName === "start" ? elements.sourceExtractStart : elements.sourceExtractEnd;
  const clock = fieldName === "start" ? elements.sourceExtractStartClock : elements.sourceExtractEndClock;
  if (!player || !input || !clock) {
    return;
  }
  input.value = Number(player.currentTime || 0).toFixed(3);
  syncClockField(input, clock, true);
  syncSourceExtractFootageClockFields();
  updateSourceTimelineExtractionRange();
}

async function createSampleFromSourceVideo() {
  const video = getSelectedSourceVideo();
  if (!video) {
    setSaveMessage("Select a source video first");
    return;
  }

  await flushPendingSave();
  if (!syncSecondsField(elements.sourceExtractStart, elements.sourceExtractStartClock, true)) {
    return;
  }
  if (!syncSecondsField(elements.sourceExtractEnd, elements.sourceExtractEndClock, true)) {
    return;
  }

  const startTime = Number(elements.sourceExtractStart.value);
  const endTime = Number(elements.sourceExtractEnd.value);
  const violationType = String(elements.sourceExtractViolationType.value || "").trim();
  if (!violationType) {
    setSaveMessage("Choose a violation type before creating a sample");
    return;
  }
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    setSaveMessage("Clip end must be greater than clip start");
    return;
  }

  setSaveMessage("Creating sample from source video…");
  const response = await fetch("/api/source-videos/create-sample", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source_video_key: video.source_video_key,
      violation_type: violationType,
      start_time: startTime,
      end_time: endTime,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to create source-video sample" }));
    setSaveMessage(payload.error || "Failed to create source-video sample");
    return;
  }

  const payload = await response.json();
  state.samples = payload.samples;
  state.summary = payload.summary;
  state.selectedId = payload.sample.sample_id;
  state.activeWorkspaceTab = "samples";
  ensureSelection();
  render();
  setSaveMessage(`Created sample ${payload.sample.clip_path.split("/").pop()} from ${video.file_name}`);
}

function renderSourceVideoWorkspace() {
  const video = getSelectedSourceVideo();
  if (!video) {
    elements.sourceSelectedKicker.textContent = "No source video selected";
    elements.sourceSelectedTitle.textContent = "Choose a source video to extract clips";
    elements.sourceLibraryStatusBanner.textContent = "Source videos in the dataset/videos folder appear here.";
    elements.sourceLibraryMetadata.innerHTML = "";
    elements.sourceLibraryPlayer.removeAttribute("src");
    elements.sourceLibraryPlayer.load();
    elements.sourceFootageStartTime.value = "";
    elements.sourceExtractStartFootageClock.value = "";
    elements.sourceExtractEndFootageClock.value = "";
    elements.sourceExtractStatus.textContent =
      "Use the source-video player to scrub, then capture clip boundaries and create a new workspace sample.";
    renderSourceVideoTimeline();
    return;
  }

  elements.sourceSelectedKicker.textContent = `videos / ${video.video_id}`;
  elements.sourceSelectedTitle.textContent = video.file_name;
  elements.sourceFootageStartTime.value = getFootageStartTime(video.source_video_key);
  elements.sourceLibraryStatusBanner.textContent =
    "Scrub the full source video, set the clip start/end, choose a violation type, then create a new workspace sample.";
  elements.sourceLibraryMetadata.innerHTML = `
    <dl class="key-value-grid">
      <div><dt>Source Path</dt><dd>${escapeHtml(video.source_video_path)}</dd></div>
      <div><dt>Video Id</dt><dd>${escapeHtml(video.video_id)}</dd></div>
      <div><dt>Browser Preview</dt><dd>${escapeHtml(browserSourceUrlForKey(video.source_video_key))}</dd></div>
    </dl>
  `;

  const playerSrc = browserSourceUrlForKey(video.source_video_key);
  setVideoGridFrameSourceKey(elements.sourceLibraryPlayer, video.source_video_key);
  if (elements.sourceLibraryPlayer.dataset.src !== playerSrc) {
    elements.sourceLibraryPlayer.dataset.loaded = "false";
    elements.sourceLibraryPlayer.dataset.src = playerSrc;
    elements.sourceLibraryPlayer.src = playerSrc;
    elements.sourceLibraryPlayer.load();
    elements.sourceLibraryPlayer.addEventListener("loadedmetadata", () => {
      elements.sourceLibraryPlayer.dataset.loaded = "true";
      restoreSourceVideoPosition(video);
      resetSourceExtractInputs();
      renderSourceVideoTimeline();
      updateVideoGridOverlaySizes();
    }, { once: true });
  }

  const violationField = state.schema.fields.find((field) => field.name === "violation_type");
  const options = (violationField?.options || []).filter(
    (option) => !SOURCE_EXTRACT_EXCLUDED_VIOLATION_TYPES.has(String(option || "").trim())
  );
  if (elements.sourceExtractViolationType.options.length !== options.length) {
    elements.sourceExtractViolationType.innerHTML = options
      .map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`)
      .join("");
  }
  syncSourceExtractFootageClockFields();
  renderSourceVideoTimeline();
}

function ensureRuleSelection() {
  const visible = getVisibleRules();
  if (!visible.length && state.selectedRuleId !== "__new__") {
    state.selectedRuleId = "__new__";
    return;
  }
  if (state.selectedRuleId === "__new__") {
    return;
  }
  if (!visible.some((rule) => rule.id === state.selectedRuleId)) {
    state.selectedRuleId = visible[0]?.id || "__new__";
  }
}

function describeRule(rule) {
  const field = state.ruleCatalog?.fields?.find((item) => item.name === rule.field_name);
  const fieldLabel = field?.label || rule.field_name;
  const conditions = [];
  if (rule.conditions?.video_id) {
    conditions.push(`source video = ${rule.conditions.video_id}`);
  }
  if (rule.conditions?.violation_type) {
    conditions.push(`violation = ${rule.conditions.violation_type}`);
  }
  if (rule.conditions?.violator_type) {
    conditions.push(`violator = ${rule.conditions.violator_type}`);
  }
  const whenText = conditions.length ? conditions.join(", ") : "all samples";
  const valueText = rule.value === "" ? "(blank)" : rule.value;
  return `${fieldLabel} -> ${valueText} when ${whenText}`;
}

function ruleFieldLabel(rule) {
  const field = state.ruleCatalog?.fields?.find((item) => item.name === rule.field_name);
  return field?.label || rule.field_name;
}

function createRuleSelect(options, selectedValue) {
  const select = document.createElement("select");
  options.forEach((option) => {
    const optionNode = document.createElement("option");
    optionNode.value = option;
    optionNode.textContent = option || "Any";
    if (option === selectedValue) {
      optionNode.selected = true;
    }
    select.appendChild(optionNode);
  });
  return select;
}

function createRuleValueInput(rule) {
  const field = state.ruleCatalog.fields.find((item) => item.name === rule.field_name);
  if (!field) {
    const input = document.createElement("input");
    input.type = "text";
    input.value = rule.value || "";
    return input;
  }
  if (field.input_type === "select") {
    const select = document.createElement("select");
    const options = [...field.options];
    if (!options.includes(rule.value || "")) {
      options.push(rule.value || "");
    }
    options.forEach((option) => {
      const optionNode = document.createElement("option");
      optionNode.value = option;
      optionNode.textContent = option || "Blank";
      if (option === (rule.value || "")) {
        optionNode.selected = true;
      }
      select.appendChild(optionNode);
    });
    return select;
  }
  const input = document.createElement(field.input_type === "textarea" ? "textarea" : "input");
  if (field.input_type !== "textarea") {
    input.type = "text";
  }
  input.value = rule.value || "";
  input.placeholder = field.input_type === "textarea" ? "Blank value" : "Rule value";
  return input;
}

function renderRuleList() {
  const rules = getVisibleRules();
  elements.ruleCount.textContent = `${rules.length} visible rules`;
  elements.ruleList.innerHTML = "";

  if (!rules.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No rules match the current filter.";
    elements.ruleList.appendChild(empty);
    return;
  }

  rules.forEach((rule) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "sample-card";
    if (rule.id === state.selectedRuleId) {
      item.classList.add("is-selected");
    }
    const conditionCount = Object.keys(rule.conditions || {}).length;
    item.innerHTML = `
      <div class="sample-card-header">
        <h3>${escapeHtml(rule.label || "Untitled rule")}</h3>
      </div>
      <p class="sample-card-subtitle">${escapeHtml(describeRule(rule))}</p>
      <div class="badge-row">
        <span class="badge workspace">${escapeHtml(ruleFieldLabel(rule))}</span>
        <span class="badge pending">${conditionCount} condition${conditionCount === 1 ? "" : "s"}</span>
      </div>
    `;
    item.addEventListener("click", () => {
      state.selectedRuleId = rule.id;
      render();
    });
    elements.ruleList.appendChild(item);
  });
}

function renderRuleEditor() {
  const rule = getSelectedRule();
  elements.ruleForm.innerHTML = "";
  if (!state.ruleCatalog) {
    elements.ruleSelectedTitle.textContent = "Rules are still loading";
    return;
  }

  const isNew = !rule || rule.id === "__new__";
  const workingRule = rule || {
    id: "__new__",
    label: "",
    field_name: "intersection_type",
    value: "",
    conditions: {},
  };

  elements.ruleSelectedKicker.textContent = isNew ? "New rule" : "Existing rule";
  elements.ruleSelectedTitle.textContent = isNew ? "Create a new default rule" : workingRule.label || "Edit rule";

  const labelWrap = document.createElement("div");
  labelWrap.className = "field-wrap full-width";
  labelWrap.innerHTML = `
    <label for="rule-label">Rule Label</label>
    <input id="rule-label" type="text" value="${escapeHtml(workingRule.label || "")}" placeholder="Optional human-friendly name" />
  `;
  elements.ruleForm.appendChild(labelWrap);

  const fieldWrap = document.createElement("div");
  fieldWrap.className = "field-wrap";
  const fieldLabel = document.createElement("label");
  fieldLabel.setAttribute("for", "rule-field-name");
  fieldLabel.textContent = "Field";
  const fieldSelect = document.createElement("select");
  fieldSelect.id = "rule-field-name";
  state.ruleCatalog.fields.forEach((field) => {
    const option = document.createElement("option");
    option.value = field.name;
    option.textContent = field.label;
    if (field.name === workingRule.field_name) {
      option.selected = true;
    }
    fieldSelect.appendChild(option);
  });
  fieldWrap.appendChild(fieldLabel);
  fieldWrap.appendChild(fieldSelect);
  elements.ruleForm.appendChild(fieldWrap);

  state.ruleCatalog.condition_fields.forEach((conditionField) => {
    const wrap = document.createElement("div");
    wrap.className = "field-wrap";
    const label = document.createElement("label");
    label.setAttribute("for", `rule-condition-${conditionField.name}`);
    label.textContent = conditionField.label;
    const select = createRuleSelect(conditionField.options, workingRule.conditions?.[conditionField.name] || "");
    select.id = `rule-condition-${conditionField.name}`;
    wrap.appendChild(label);
    wrap.appendChild(select);
    elements.ruleForm.appendChild(wrap);
  });

  const valueWrap = document.createElement("div");
  valueWrap.className = "field-wrap full-width";
  const valueLabel = document.createElement("label");
  valueLabel.setAttribute("for", "rule-value");
  valueLabel.textContent = "Value";
  const valueInput = createRuleValueInput(workingRule);
  valueInput.id = "rule-value";
  valueWrap.appendChild(valueLabel);
  valueWrap.appendChild(valueInput);
  elements.ruleForm.appendChild(valueWrap);

  const rerenderValueInput = () => {
    const nextRule = {
      ...workingRule,
      field_name: fieldSelect.value,
      value: "",
    };
    const nextInput = createRuleValueInput(nextRule);
    nextInput.id = "rule-value";
    valueWrap.replaceChildren(valueLabel, nextInput);
  };
  fieldSelect.addEventListener("change", rerenderValueInput);

  const canDelete = !isNew;
  elements.deleteRuleFutureButton.disabled = !canDelete;
  elements.deleteRuleRetroactiveButton.disabled = !canDelete;
}

function collectRuleFormPayload() {
  const fieldName = document.getElementById("rule-field-name")?.value || "";
  const valueField = document.getElementById("rule-value");
  return {
    label: document.getElementById("rule-label")?.value?.trim() || "",
    field_name: fieldName,
    value: valueField?.value ?? "",
    conditions: {
      video_id: document.getElementById("rule-condition-video_id")?.value || "",
      violation_type: document.getElementById("rule-condition-violation_type")?.value || "",
      violator_type: document.getElementById("rule-condition-violator_type")?.value || "",
    },
  };
}

function renderInsights() {
  const renderPills = (container, entries, noun) => {
    container.innerHTML = "";
    entries.forEach(([label, count]) => {
      const pill = document.createElement("div");
      pill.className = "insight-pill";
      pill.innerHTML = `<strong>${escapeHtml(label)}</strong><span>${count} ${noun}</span>`;
      container.appendChild(pill);
    });
    if (!entries.length) {
      container.innerHTML = '<p class="empty-state">No active samples yet.</p>';
    }
  };

  renderPills(
    elements.categoryInsights,
    countByField("violation_type", {
      visibilityScope: state.violationInsightScope,
      completeOnly: state.violationCompleteOnly,
    }),
    "samples"
  );

  elements.videoCategoryInsights.innerHTML = "";
  const groupedEntries = countViolationTypesByVideo({
    visibilityScope: state.videoViolationInsightScope,
    completeOnly: state.videoViolationCompleteOnly,
  });
  if (!groupedEntries.length) {
    elements.videoCategoryInsights.innerHTML = '<p class="empty-state">No active samples yet.</p>';
    return;
  }

  const createVideoBreakdown = ([videoId, entry]) => {
    const details = document.createElement("details");
    details.className = "insight-breakdown";
    details.open = state.openVideoInsightIds.has(videoId);
    details.addEventListener("toggle", () => {
      if (details.open) {
        state.openVideoInsightIds.add(videoId);
      } else {
        state.openVideoInsightIds.delete(videoId);
      }
    });
    const visibilityLabel =
      entry.visibility === "public" ? "Public" : entry.visibility === "secret" ? "Secret" : "Mixed";
    details.innerHTML = `
      <summary>
        <span class="insight-breakdown-title">${escapeHtml(videoId)}</span>
        <span class="insight-breakdown-summary-meta">
          <span class="visibility-pill ${entry.visibility}">${visibilityLabel}</span>
          <span class="insight-breakdown-meta">${entry.total} samples</span>
        </span>
      </summary>
      <div class="insight-breakdown-pills">
        ${entry.counts
          .map(
            ([label, count]) =>
              `<div class="insight-pill"><strong>${escapeHtml(label)}</strong><span>${count} samples</span></div>`
          )
          .join("")}
      </div>
    `;
    return details;
  };

  const midpoint = Math.ceil(groupedEntries.length / 2);
  [groupedEntries.slice(0, midpoint), groupedEntries.slice(midpoint)].forEach((columnEntries) => {
    const column = document.createElement("div");
    column.className = "insight-breakdown-column";
    columnEntries.forEach((entry) => {
      column.appendChild(createVideoBreakdown(entry));
    });
    elements.videoCategoryInsights.appendChild(column);
  });
}

function renderSampleList() {
  const samples = getVisibleSamples();
  const overlapMap = getOverlappingSampleMap();
  elements.sampleCount.textContent = `${samples.length} visible samples`;
  elements.sampleList.innerHTML = "";

  if (!samples.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No clips match the current filters.";
    elements.sampleList.appendChild(empty);
    return;
  }

  samples.forEach((sample) => {
    const missingFields = getMissingFields(sample);
    const missingCount = missingFields.length;
    const isComplete = missingCount === 0;
    const isCompleteExceptDescription = !isComplete && missingFields.every((field) => field === "description");
    const item = document.createElement("div");
    item.className = "sample-card";
    item.tabIndex = 0;
    item.setAttribute("role", "button");
    if (sample.sample_id === state.selectedId) {
      item.classList.add("is-selected");
    }
    if (sample.is_deleted) {
      item.classList.add("is-deleted");
    }

    const badges = [];
    badges.push(
      `<span class="badge ${isComplete ? "complete" : isCompleteExceptDescription ? "complete-partial" : "pending"}">${
        isComplete ? "Complete" : isCompleteExceptDescription ? "Complete Except Description" : `${missingCount} missing`
      }</span>`
    );
    if (sample.is_deleted) {
      badges.push('<span class="badge deleted">deleted</span>');
    }
    const overlappingSamples = overlapMap.get(sample.sample_id) || [];
    if (overlappingSamples.length) {
      badges.push('<span class="badge overlapping">Overlapping</span>');
    }
    if (String(sample.notes || "").trim()) {
      badges.push('<span class="badge notes">Notes</span>');
    }
    const overlapLinks = overlappingSamples.length
      ? `<div class="sample-overlap-row">
          <span>Overlaps</span>
          ${overlappingSamples
            .map(
              (overlap) =>
                `<a href="#" class="sample-overlap-link" data-sample-id="${escapeHtml(overlap.sampleId)}">${escapeHtml(
                  overlap.clipName
                )}</a>`
            )
            .join("")}
        </div>`
      : "";

    item.innerHTML = `
      <div class="sample-card-header">
        <h3>${sample.clip_path.split("/").pop()}</h3>
        <button
          class="sample-export-toggle ${sample.is_for_export ? "is-enabled" : "is-disabled"}"
          type="button"
          aria-pressed="${sample.is_for_export ? "true" : "false"}"
        >
          ${sample.is_for_export ? "Public" : "Secret"}
        </button>
      </div>
      <div class="sample-meta">
        <span>${displayViolationLabel(sample.violation_type || sample.clip_folder)}</span>
      </div>
      <div class="badge-row">${badges.join("")}</div>
      ${overlapLinks}
    `;

    item.addEventListener("click", async () => {
      await selectSample(sample.sample_id);
    });
    item.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      await selectSample(sample.sample_id);
    });
    const exportToggle = item.querySelector(".sample-export-toggle");
    exportToggle?.addEventListener("click", async (event) => {
      event.stopPropagation();
      await toggleSampleExportState(sample.sample_id, !sample.is_for_export);
    });
    item.querySelectorAll(".sample-overlap-link").forEach((link) => {
      link.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await selectSample(link.dataset.sampleId);
      });
    });
    elements.sampleList.appendChild(item);
  });
}

function renderMetadataPanel(sample) {
  const entries = [
    ["Clip path", sample.clip_path],
    ["Original clip", sample.original_clip_path || sample.clip_path],
    ["Clip size", formatBytes(sample.clip_size_bytes)],
    ["Visibility", sample.is_for_export ? "Public" : "Secret"],
    ["Source video", sample.source_video_path || `${sample.video_id}.avi`],
    ["Browser source", sample.source_video_browser_path || `${sample.video_id}.mp4`],
    ["Folder label", sample.clip_folder],
    ["Annotation start", sample.start_time ?? "Unknown"],
    ["Annotation end", sample.end_time ?? "Unknown"],
    ["Clip start", sample.clip_source_start_time ?? "Unknown"],
    ["Clip end", sample.clip_source_end_time ?? "Unknown"],
  ];

  elements.metadataPanel.innerHTML = `
    <h3>Sample Metadata</h3>
    <dl class="key-value-grid">
      ${entries
        .map(
          ([label, value]) =>
            `<div><dt>${label}</dt><dd>${String(value)}</dd></div>`
        )
        .join("")}
    </dl>
  `;
}

function setTrimInputFromPlayer(fieldName) {
  const player = document.getElementById("source-video-player");
  const input = document.getElementById(`trim-${fieldName}`);
  if (!player || !input) {
    return;
  }
  if (!isSourcePlayerLoaded()) {
    setSaveMessage("Load the source video first");
    return;
  }
  input.value = Number(player.currentTime || 0).toFixed(3);
  syncTrimClockField(fieldName);
}

function resetTrimInputs(sample) {
  const startInput = document.getElementById("trim-start");
  const endInput = document.getElementById("trim-end");
  if (!startInput || !endInput) {
    return;
  }
  startInput.value = sample.clip_source_start_time ?? sample.start_time ?? 0;
  endInput.value = sample.clip_source_end_time ?? sample.end_time ?? 0;
  syncTrimClockField("start");
  syncTrimClockField("end");
}

async function generateTrimmedClip(mode) {
  const sample = getSelectedSample();
  if (!sample) {
    return;
  }
  await flushPendingSave();
  const startInput = document.getElementById("trim-start");
  const endInput = document.getElementById("trim-end");
  if (!startInput || !endInput) {
    return;
  }

  const startTime = Number(startInput.value);
  const endTime = Number(endInput.value);
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    setSaveMessage("Trim start and end must be numbers");
    return;
  }
  if (endTime <= startTime) {
    setSaveMessage("Trim end must be greater than trim start");
    return;
  }

  setSaveMessage(mode === "replace" ? "Generating replacement clip…" : "Generating new sample clip…");
  const response = await fetch(`/api/samples/${encodeURIComponent(sample.sample_id)}/trim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start_time: startTime,
      end_time: endTime,
      mode,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Clip generation failed" }));
    setSaveMessage(payload.error || "Clip generation failed");
    return;
  }

  const payload = await response.json();
  state.samples = payload.samples;
  state.summary = payload.summary;
  state.selectedId = payload.sample.sample_id;
  ensureSelection();
  render();
  setSaveMessage(
    mode === "replace"
      ? "Generated a new clip and updated this sample to use it"
      : "Generated a new clip and added it as a new workspace sample"
  );
}

async function splitClipAtPlayhead() {
  const sample = getSelectedSample();
  const player = document.getElementById("source-video-player");
  const startInput = document.getElementById("trim-start");
  const endInput = document.getElementById("trim-end");
  if (!sample || !player || !startInput || !endInput) {
    return;
  }
  if (!isSourcePlayerLoaded()) {
    setSaveMessage("Load the source video first");
    return;
  }

  await flushPendingSave();
  const startTime = Number(startInput.value);
  const endTime = Number(endInput.value);
  const splitTime = Number(player.currentTime || 0);
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || Number.isNaN(splitTime)) {
    setSaveMessage("Trim bounds and split point must be numbers");
    return;
  }
  if (endTime <= startTime) {
    setSaveMessage("Trim end must be greater than trim start");
    return;
  }
  if (splitTime <= startTime || splitTime >= endTime) {
    setSaveMessage("Move the playhead to a point inside the clip bounds before splitting");
    return;
  }

  setSaveMessage("Splitting clip into two samples…");
  const response = await fetch(`/api/samples/${encodeURIComponent(sample.sample_id)}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start_time: startTime,
      split_time: splitTime,
      end_time: endTime,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Clip split failed" }));
    setSaveMessage(payload.error || "Clip split failed");
    return;
  }

  const payload = await response.json();
  state.samples = payload.samples;
  state.summary = payload.summary;
  state.selectedId = payload.sample.sample_id;
  ensureSelection();
  render();
  setSaveMessage("Split the clip and created a second sample from the latter half");
}

async function splitFromClipPlayer() {
  const sample = getSelectedSample();
  const player = elements.clipPlayer;
  if (!sample || !player) {
    return;
  }

  await flushPendingSave();
  const splitTime = Number(player.currentTime || 0);
  const clipDuration = Number(player.duration || 0);
  if (Number.isNaN(splitTime) || Number.isNaN(clipDuration) || clipDuration <= 0) {
    setSaveMessage("Load the clip fully before splitting from the clip player");
    return;
  }
  if (splitTime <= 0 || splitTime >= clipDuration) {
    setSaveMessage("Move the clip playhead to a point inside the clip before splitting");
    return;
  }

  setSaveMessage("Splitting current clip into two samples…");
  const response = await fetch(`/api/samples/${encodeURIComponent(sample.sample_id)}/split-from-clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      split_time: splitTime,
      clip_duration: clipDuration,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Clip split failed" }));
    setSaveMessage(payload.error || "Clip split failed");
    return;
  }

  const payload = await response.json();
  state.samples = payload.samples;
  state.summary = payload.summary;
  state.selectedId = payload.sample.sample_id;
  ensureSelection();
  render();
  setSaveMessage("Split the current clip itself and created a second sample");
}

function renderTrimPanel(sample) {
  const startValue = sample.clip_source_start_time ?? sample.start_time ?? 0;
  const endValue = sample.clip_source_end_time ?? sample.end_time ?? 0;

  elements.trimPanel.innerHTML = `
    <h3>Clip Trimming</h3>
    <div class="trim-panel-grid">
      <div>
        <div class="video-grid-frame">
          <video id="source-video-player" controls preload="none" data-loaded="false"></video>
          ${videoGridOverlayMarkup()}
        </div>
      </div>
      <div class="trim-controls">
        <p class="trim-hint">
          The trim player uses a workspace MP4 copy of <code>${escapeHtml(
            sample.source_video_path || `${sample.video_id}.avi`
          )}</code> so the browser can play it reliably. Move the playhead, then capture exact clip boundaries.
        </p>
        <div class="trim-setters">
          <button id="trim-load-source" class="secondary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Load Source Video</button>
        </div>
        <div class="trim-input-grid">
          <label>
            Trim Start H:MM:SS
            <input id="trim-start-clock" type="text" placeholder="0:00:00" value="${formatSecondsToClock(startValue)}" ${sample.is_deleted ? "disabled" : ""} />
          </label>
          <label>
            Trim End H:MM:SS
            <input id="trim-end-clock" type="text" placeholder="0:00:00" value="${formatSecondsToClock(endValue)}" ${sample.is_deleted ? "disabled" : ""} />
          </label>
          <label>
            Footage Start HH:MM:SS
            <input id="trim-start-footage-clock" type="text" placeholder="HH:MM:SS" ${sample.is_deleted ? "disabled" : ""} />
          </label>
          <label>
            Footage End HH:MM:SS
            <input id="trim-end-footage-clock" type="text" placeholder="HH:MM:SS" ${sample.is_deleted ? "disabled" : ""} />
          </label>
          <label>
            Trim Start (seconds)
            <input id="trim-start" type="number" min="0" step="0.001" value="${startValue}" ${sample.is_deleted ? "disabled" : ""} />
          </label>
          <label>
            Trim End (seconds)
            <input id="trim-end" type="number" min="0" step="0.001" value="${endValue}" ${sample.is_deleted ? "disabled" : ""} />
          </label>
        </div>
        <div class="trim-setters">
          <button id="trim-set-start" class="secondary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Set Start From Playhead</button>
          <button id="trim-set-end" class="secondary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Set End From Playhead</button>
          <button id="trim-reset" class="secondary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Reset To Current Clip</button>
        </div>
        <div class="trim-actions">
          <button id="trim-replace" type="button" ${sample.is_deleted ? "disabled" : ""}>Replace Current Clip</button>
          <button id="trim-duplicate" class="primary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Save As New Sample</button>
          <button id="trim-split" class="secondary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Split At Playhead</button>
          <button id="trim-split-clip" class="secondary-button" type="button" ${sample.is_deleted ? "disabled" : ""}>Split From Clip</button>
        </div>
        <p class="trim-hint">
          Current source clip bounds: ${formatSeconds(startValue)}s to ${formatSeconds(endValue)}s
        </p>
      </div>
    </div>
  `;

  const setStartButton = document.getElementById("trim-set-start");
  const setEndButton = document.getElementById("trim-set-end");
  const resetButton = document.getElementById("trim-reset");
  const replaceButton = document.getElementById("trim-replace");
  const duplicateButton = document.getElementById("trim-duplicate");
  const splitButton = document.getElementById("trim-split");
  const splitClipButton = document.getElementById("trim-split-clip");
  const startInput = document.getElementById("trim-start");
  const endInput = document.getElementById("trim-end");
  const startClockInput = document.getElementById("trim-start-clock");
  const endClockInput = document.getElementById("trim-end-clock");
  const startFootageClockInput = document.getElementById("trim-start-footage-clock");
  const endFootageClockInput = document.getElementById("trim-end-footage-clock");
  const loadSourceButton = document.getElementById("trim-load-source");
  const sourcePlayer = document.getElementById("source-video-player");
  setVideoGridFrameSourceKey(sourcePlayer, sourceVideoKeyForSample(sample));
  syncFootageClockField(startInput, startFootageClockInput, sourceVideoKeyForSample(sample));
  syncFootageClockField(endInput, endFootageClockInput, sourceVideoKeyForSample(sample));

  startInput?.addEventListener("input", () => syncTrimClockField("start"));
  endInput?.addEventListener("input", () => syncTrimClockField("end"));
  startClockInput?.addEventListener("change", () => syncTrimSecondsField("start"));
  endClockInput?.addEventListener("change", () => syncTrimSecondsField("end"));
  startFootageClockInput?.addEventListener("change", () => syncTrimSecondsFromFootageField("start"));
  endFootageClockInput?.addEventListener("change", () => syncTrimSecondsFromFootageField("end"));
  loadSourceButton?.addEventListener("click", () => loadSourceVideo(sample));
  setStartButton?.addEventListener("click", () => setTrimInputFromPlayer("start"));
  setEndButton?.addEventListener("click", () => setTrimInputFromPlayer("end"));
  resetButton?.addEventListener("click", () => resetTrimInputs(sample));
  replaceButton?.addEventListener("click", () => generateTrimmedClip("replace"));
  duplicateButton?.addEventListener("click", () => generateTrimmedClip("duplicate"));
  splitButton?.addEventListener("click", splitClipAtPlayhead);
  splitClipButton?.addEventListener("click", splitFromClipPlayer);
}

function renderFieldLists(sample) {
  const missingFields = getMissingFields(sample);

  elements.needsList.innerHTML = missingFields.length
    ? missingFields.map((field) => `<span class="field-pill empty">${fieldLabel(field)}</span>`).join("")
    : '<span class="field-pill filled">All fields filled</span>';
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function countWords(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function updatePositionGridSelection(control, value) {
  control.querySelectorAll("[data-position-value]").forEach((button) => {
    const isSelected = button.dataset.positionValue === value;
    button.classList.toggle("is-selected", isSelected);
    button.setAttribute("aria-checked", isSelected ? "true" : "false");
  });
}

function createPositionGridInput(field, sample) {
  const currentValue = String(sample[field.name] || "").trim();
  const control = document.createElement("div");
  control.className = "position-grid-control";
  control.setAttribute("role", "radiogroup");
  control.setAttribute("aria-label", field.label);

  const hiddenInput = document.createElement("input");
  hiddenInput.type = "hidden";
  hiddenInput.id = `field-${field.name}`;
  hiddenInput.name = field.name;
  hiddenInput.value = currentValue;
  control.appendChild(hiddenInput);

  const grid = document.createElement("div");
  grid.className = "position-grid-picker";
  VIDEO_GRID_LABELS.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "position-grid-cell";
    button.dataset.positionValue = option;
    button.setAttribute("role", "radio");
    button.textContent = option;
    button.disabled = sample.is_deleted;
    button.addEventListener("click", () => {
      hiddenInput.value = option;
      updatePositionGridSelection(control, option);
      handleFieldChange(field.name, option, true);
    });
    grid.appendChild(button);
  });
  control.appendChild(grid);

  if (field.options.includes("na")) {
    const naButton = document.createElement("button");
    naButton.type = "button";
    naButton.className = "position-grid-na";
    naButton.dataset.positionValue = "na";
    naButton.setAttribute("role", "radio");
    naButton.textContent = "N/A";
    naButton.disabled = sample.is_deleted;
    naButton.addEventListener("click", () => {
      hiddenInput.value = "na";
      updatePositionGridSelection(control, "na");
      handleFieldChange(field.name, "na", true);
    });
    control.appendChild(naButton);
  }

  updatePositionGridSelection(control, currentValue);
  return control;
}

function createFieldInput(field, sample) {
  const wrapper = document.createElement("div");
  wrapper.className = "field-wrap";
  if (field.input_type === "textarea") {
    wrapper.classList.add("full-width");
  }

  const label = document.createElement("label");
  label.setAttribute("for", `field-${field.name}`);
  label.textContent = field.label;
  if (field.name === "description") {
    label.classList.add("field-label-with-meta");
    const counter = document.createElement("span");
    counter.className = "field-word-count";
    counter.textContent = `${countWords(sample[field.name] || "")} words`;
    label.appendChild(counter);
  }

  if (POSITION_GRID_FIELDS.has(field.name)) {
    wrapper.classList.add("position-field-wrap");
    wrapper.appendChild(label);
    wrapper.appendChild(createPositionGridInput(field, sample));
    if (field.source_note) {
      const note = document.createElement("small");
      note.textContent = field.source_note;
      wrapper.appendChild(note);
    }
    return wrapper;
  }

  let input;
  if (field.input_type === "textarea") {
    input = document.createElement("textarea");
  } else if (field.input_type === "select") {
    input = document.createElement("select");
    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "Select an option";
    input.appendChild(blank);
    const options = field.options.filter((option) => !isHiddenFieldOption(field.name, option));
    const currentValue = String(sample[field.name] || "").trim();
    if (currentValue && !isHiddenFieldOption(field.name, currentValue) && !options.includes(currentValue)) {
      options.push(currentValue);
    }
    options.forEach((option) => {
      const optionNode = document.createElement("option");
      optionNode.value = option;
      optionNode.textContent = option;
      input.appendChild(optionNode);
    });
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.placeholder = `Enter ${field.label.toLowerCase()}`;
    if (field.name === "date") {
      input.placeholder = "YYYY-MM-DD";
      input.pattern = "\\d{4}-\\d{2}-\\d{2}";
      input.inputMode = "numeric";
      input.maxLength = 10;
      input.autocomplete = "off";
    }
    if (field.name === "time") {
      input.placeholder = "HH:MM:SS";
      input.pattern = "\\d{2}:\\d{2}:\\d{2}";
      input.inputMode = "numeric";
      input.maxLength = 8;
      input.autocomplete = "off";
    }
  }

  input.id = `field-${field.name}`;
  input.name = field.name;
  input.value = sample[field.name] || "";
  input.disabled = sample.is_deleted;
  input.addEventListener("input", (event) => {
    handleFieldChange(field.name, event.target.value);
    if (field.name === "description") {
      const counter = label.querySelector(".field-word-count");
      if (counter) {
        counter.textContent = `${countWords(event.target.value)} words`;
      }
    }
  });
  input.addEventListener("change", (event) => {
    handleFieldChange(field.name, event.target.value, true);
  });

  wrapper.appendChild(label);
  wrapper.appendChild(input);

  if (field.source_note) {
    const note = document.createElement("small");
    note.textContent = field.source_note;
    wrapper.appendChild(note);
  }
  return wrapper;
}

function validateFieldFormat(fieldName, value) {
  if (!value) {
    return { valid: true, message: "" };
  }
  if (fieldName === "date") {
    const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
    if (!match) {
      return { valid: false, message: "Use YYYY-MM-DD" };
    }
    const parsed = new Date(`${value}T00:00:00Z`);
    const [year, month, day] = value.split("-").map(Number);
    const valid =
      parsed instanceof Date &&
      !Number.isNaN(parsed.getTime()) &&
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day;
    return { valid, message: valid ? "" : "Use a real calendar date" };
  }
  if (fieldName === "time") {
    const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (!match) {
      return { valid: false, message: "Use HH:MM:SS" };
    }
    const [, hours, minutes, seconds] = match.map(Number);
    const valid = hours <= 23 && minutes <= 59 && seconds <= 59;
    return { valid, message: valid ? "" : "Use a real time value" };
  }
  return { valid: true, message: "" };
}

function renderForm(sample) {
  elements.annotationForm.innerHTML = "";
  state.schema.fields.forEach((field) => {
    elements.annotationForm.appendChild(createFieldInput(field, sample));
  });
}

function updatePlayerSource(sample) {
  const nextSource = mediaUrlForPath(sample.clip_path);
  setVideoGridFrameSourceKey(elements.clipPlayer, sourceVideoKeyForSample(sample));
  if (elements.clipPlayer.dataset.src !== nextSource) {
    elements.clipPlayer.dataset.src = nextSource;
    elements.clipPlayer.src = nextSource;
    elements.clipPlayer.load();
  }
}

function formatQwenRequestSummary(summary) {
  if (!summary) {
    return "";
  }
  return [
    `${summary.provider || "Provider"} / ${summary.model || "model"}`,
    `${summary.keyframes || 0} keyframes`,
    `${summary.prompt_type || "prompt"} prompt`,
  ].join(" · ");
}

function renderQwenPanel(sample) {
  const matchingDraft = state.qwenDraft?.sampleId === sample?.sample_id ? state.qwenDraft : null;
  const oldDescription = matchingDraft?.oldDescription ?? (sample?.description || "");
  elements.qwenOldDescription.value = oldDescription;
  elements.qwenDraftDescription.value = matchingDraft?.draftDescription || "";
  elements.qwenDraftDescription.disabled = !matchingDraft || sample?.is_deleted;
  elements.qwenGenerateButton.disabled = !sample || sample.is_deleted;
  elements.qwenApplyButton.disabled = !matchingDraft || sample?.is_deleted;
  elements.qwenDiscardButton.disabled = !matchingDraft;
  elements.qwenStatus.textContent = matchingDraft ? "Draft ready. Review before applying." : "No draft generated.";
  elements.qwenRequestSummary.textContent = formatQwenRequestSummary(matchingDraft?.requestSummary);
}

function getBatchSourceVideos() {
  if (state.sourceVideos.length) {
    return state.sourceVideos;
  }
  const seen = new Set();
  return state.samples
    .filter((sample) => !sample.is_deleted)
    .map((sample) => sourceVideoKeyForSample(sample))
    .filter((sourceVideoKey) => {
      if (!sourceVideoKey || seen.has(sourceVideoKey)) {
        return false;
      }
      seen.add(sourceVideoKey);
      return true;
    })
    .map((sourceVideoKey) => ({
      source_video_key: sourceVideoKey,
      video_id: sourceVideoKey,
      file_name: `${sourceVideoKey}.avi`,
      source_video_path: `videos/${sourceVideoKey}.avi`,
    }));
}

function getBatchSourceVideoCounts(sourceVideoKey) {
  const normalizedKey = normalizeSourceVideoKey(sourceVideoKey);
  const activeSamples = state.samples.filter(
    (sample) => !sample.is_deleted && sourceVideoKeyForSample(sample) === normalizedKey
  );
  return {
    total: activeSamples.length,
    noViolation: activeSamples.filter(
      (sample) => String(normalizeViolationTypeForExport(sample.violation_type) || "").toLowerCase() === "no_violation"
    ).length,
  };
}

function renderBatchDescriptionSourceList() {
  const videos = getBatchSourceVideos();
  elements.batchDescriptionSourceList.innerHTML = "";
  if (!videos.length) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = "No source videos are available.";
    elements.batchDescriptionSourceList.appendChild(empty);
    return;
  }

  videos.forEach((video) => {
    const sourceVideoKey = video.source_video_key || video.video_id || "";
    if (!sourceVideoKey) {
      return;
    }
    const counts = getBatchSourceVideoCounts(sourceVideoKey);
    const item = document.createElement("label");
    item.className = "batch-description-source-item";
    const noViolationSuffix = counts.noViolation ? ` · ${counts.noViolation} no-violation skipped later` : "";
    item.innerHTML = `
      <input
        class="batch-description-source-checkbox"
        type="checkbox"
        value="${escapeHtml(sourceVideoKey)}"
        data-has-samples="${counts.total > 0 ? "true" : "false"}"
        ${counts.total > 0 ? "checked" : "disabled"}
      >
      <span>
        <strong>${escapeHtml(video.file_name || sourceVideoKey)}</strong>
        <span>${escapeHtml(video.source_video_path || sourceVideoKey)}</span>
        <span>${counts.total} active samples${noViolationSuffix}</span>
      </span>
    `;
    elements.batchDescriptionSourceList.appendChild(item);
  });
}

function selectedBatchDescriptionSourceVideoKeys() {
  return Array.from(elements.batchDescriptionSourceList.querySelectorAll(".batch-description-source-checkbox:checked")).map(
    (checkbox) => checkbox.value
  );
}

function setBatchDescriptionRunning(isRunning) {
  elements.batchDescriptionButton.disabled = isRunning;
  elements.batchDescriptionStartButton.disabled = isRunning;
  elements.batchDescriptionSelectAllButton.disabled = isRunning;
  elements.batchDescriptionClearButton.disabled = isRunning;
  elements.batchDescriptionCancelButton.disabled = isRunning;
  elements.batchDescriptionSourceList.querySelectorAll(".batch-description-source-checkbox").forEach((checkbox) => {
    checkbox.disabled = isRunning || checkbox.dataset.hasSamples !== "true";
  });
}

function openBatchDescriptionDialog() {
  renderBatchDescriptionSourceList();
  elements.batchDescriptionStatus.textContent = "No batch started.";
  if (typeof elements.batchDescriptionDialog.showModal === "function") {
    elements.batchDescriptionDialog.showModal();
  } else {
    elements.batchDescriptionDialog.setAttribute("open", "");
  }
}

function closeBatchDescriptionDialog() {
  if (elements.batchDescriptionDialog.open && typeof elements.batchDescriptionDialog.close === "function") {
    elements.batchDescriptionDialog.close();
  } else {
    elements.batchDescriptionDialog.removeAttribute("open");
  }
}

function setBatchDescriptionCheckboxes(checked) {
  elements.batchDescriptionSourceList.querySelectorAll(".batch-description-source-checkbox").forEach((checkbox) => {
    if (checkbox.dataset.hasSamples === "true") {
      checkbox.checked = checked;
    }
  });
}

function formatBatchDescriptionResult(payload) {
  const parts = [
    `Generated ${payload.generated_count || 0}`,
    `time skipped ${payload.time_discrepancy_count || 0}`,
    `no-violation skipped ${payload.no_violation_count || 0}`,
    `failed ${payload.failed_count || 0}`,
  ];
  if (payload.backup_path) {
    parts.push(`backup ${payload.backup_path}`);
  }
  return parts.join(" · ");
}

async function runBatchDescriptionGeneration() {
  const settings = getQwenSettingsFromInputs();
  saveQwenSettings();
  if (!settings.model) {
    elements.batchDescriptionStatus.textContent = "Enter a model name first.";
    elements.qwenStatus.textContent = "Enter a model name first.";
    return;
  }

  const sourceVideoKeys = selectedBatchDescriptionSourceVideoKeys();
  if (!sourceVideoKeys.length) {
    elements.batchDescriptionStatus.textContent = "Select at least one source video.";
    return;
  }

  await flushPendingSave();
  setBatchDescriptionRunning(true);
  elements.batchDescriptionStatus.textContent = "Checking times and generating descriptions…";
  elements.qwenStatus.textContent = "Batch generation running…";

  try {
    const response = await fetch("/api/description-batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_video_keys: sourceVideoKeys,
        provider: settings.provider,
        endpoint: settings.endpoint,
        model: settings.model,
        keyframe_count: settings.keyframeCount,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate batch descriptions");
    }

    state.samples = payload.samples || state.samples;
    state.summary = payload.summary || state.summary;
    state.qwenDraft = null;
    updateSummaryFromSamples();
    render();
    const message = formatBatchDescriptionResult(payload);
    elements.batchDescriptionStatus.textContent = message;
    elements.qwenStatus.textContent = message;
    setSaveMessage("Batch descriptions generated");
  } catch (error) {
    const message = error.message || "Failed to generate batch descriptions";
    elements.batchDescriptionStatus.textContent = message;
    elements.qwenStatus.textContent = message;
    setSaveMessage(message);
  } finally {
    setBatchDescriptionRunning(false);
  }
}

function renderSelectedSample() {
  const sample = getSelectedSample();
  if (!sample) {
    elements.selectedKicker.textContent = "No sample selected";
    elements.selectedTitle.textContent = "Choose a clip to begin";
    elements.annotationForm.innerHTML = "";
    elements.metadataPanel.innerHTML = "";
    elements.trimPanel.innerHTML = "";
    elements.needsList.innerHTML = "";
    elements.deleteButton.disabled = true;
    elements.copyAnnotationButton.disabled = true;
    elements.copyAnnotationButton.textContent = "Copy Annotation";
    renderQwenPanel(null);
    elements.prevButton.disabled = true;
    elements.nextButton.disabled = true;
    return;
  }

  elements.selectedKicker.textContent = `${displayViolationLabel(sample.violation_type || sample.clip_folder)} / ${sample.video_id}`;
  elements.selectedTitle.textContent = sample.clip_path.split("/").pop();
  elements.copyAnnotationButton.disabled = false;
  elements.copyAnnotationButton.textContent = "Copy Annotation";
  elements.deleteButton.disabled = false;
  elements.deleteButton.textContent = sample.is_deleted ? "Restore Sample" : "Delete Sample";
  elements.deleteButton.classList.toggle("danger-button", !sample.is_deleted);

  updatePlayerSource(sample);
  renderMetadataPanel(sample);
  renderTrimPanel(sample);
  renderFieldLists(sample);
  renderQwenPanel(sample);
  renderForm(sample);
  renderNavigationButtons();
}

function renderNavigationButtons() {
  const visible = getVisibleSamples();
  const index = visible.findIndex((sample) => sample.sample_id === state.selectedId);
  elements.prevButton.disabled = index <= 0;
  elements.nextButton.disabled = index === -1 || index >= visible.length - 1;
}

function render() {
  updateSummaryFromSamples();
  renderInsights();
  renderSummary();
  renderWorkspaceTabs();
  renderSampleSidebarState();
  renderSampleList();
  renderSelectedSample();
  renderSourceVideoList();
  renderSourceVideoWorkspace();
  renderGridCalibrationPanels();
  renderRuleList();
  renderRuleEditor();
  setSaveMessage(state.saveMessage);
  bindVideoGridSizingEvents();
  requestAnimationFrame(updateVideoGridOverlaySizes);
}

async function loadSchema() {
  const response = await fetch("/api/schema");
  if (!response.ok) {
    throw new Error("Failed to load schema");
  }
  state.schema = await response.json();
}

async function loadSamples() {
  const response = await fetch("/api/samples");
  if (!response.ok) {
    throw new Error("Failed to load samples");
  }
  const payload = await response.json();
  state.samples = payload.samples;
  state.summary = payload.summary;
}

async function loadSourceVideos() {
  const response = await fetch("/api/source-video-library");
  if (!response.ok) {
    throw new Error("Failed to load source videos");
  }
  const payload = await response.json();
  state.sourceVideos = payload.videos || [];
}

async function loadSourceVideoGridSettings() {
  const response = await fetch("/api/source-videos/grid-settings");
  if (!response.ok) {
    throw new Error("Failed to load grid settings");
  }
  const payload = await response.json();
  state.sourceVideoGridSettings = payload.settings || {};
}

async function loadSourceVideoFootageStartTimes() {
  const response = await fetch("/api/source-videos/footage-start-times");
  if (!response.ok) {
    throw new Error("Failed to load footage start times");
  }
  const payload = await response.json();
  state.sourceVideoFootageStartTimes = payload.start_times || {};
}

async function loadRules() {
  const response = await fetch("/api/rules");
  if (!response.ok) {
    throw new Error("Failed to load rules");
  }
  const payload = await response.json();
  state.rules = payload.rules || [];
  state.ruleCatalog = payload;
}

async function generateQwenDescriptionDraft() {
  const sample = getSelectedSample();
  if (!sample) {
    setSaveMessage("Select a sample first");
    return;
  }
  if (sample.is_deleted) {
    setSaveMessage("Restore the sample before generating a draft");
    return;
  }

  const settings = getQwenSettingsFromInputs();
  saveQwenSettings();
  if (!settings.model) {
    elements.qwenStatus.textContent = "Enter a model name first.";
    return;
  }

  await flushPendingSave();
  state.qwenDraft = null;
  elements.qwenGenerateButton.disabled = true;
  elements.qwenApplyButton.disabled = true;
  elements.qwenDiscardButton.disabled = true;
  elements.qwenDraftDescription.disabled = true;
  elements.qwenStatus.textContent = "Generating draft from keyframes…";
  elements.qwenRequestSummary.textContent = "";

  try {
    const response = await fetch(`/api/samples/${encodeURIComponent(sample.sample_id)}/description-draft`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: settings.provider,
        endpoint: settings.endpoint,
        model: settings.model,
        keyframe_count: settings.keyframeCount,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || "Failed to generate draft");
    }
    state.qwenDraft = {
      sampleId: sample.sample_id,
      oldDescription: payload.old_description || "",
      draftDescription: payload.draft_description || "",
      requestSummary: payload.request_summary || null,
    };
    if (state.selectedId === sample.sample_id) {
      renderQwenPanel(sample);
    }
    setSaveMessage("Description draft generated");
  } catch (error) {
    if (state.selectedId === sample.sample_id) {
      renderQwenPanel(sample);
      elements.qwenStatus.textContent = error.message || "Failed to generate draft";
    }
    setSaveMessage(error.message || "Failed to generate draft");
  } finally {
    if (state.selectedId === sample.sample_id) {
      elements.qwenGenerateButton.disabled = sample.is_deleted;
    }
  }
}

async function applyQwenDraft() {
  const sample = getSelectedSample();
  if (!sample || state.qwenDraft?.sampleId !== sample.sample_id) {
    return;
  }
  const draft = elements.qwenDraftDescription.value.trim();
  if (!draft) {
    elements.qwenStatus.textContent = "Draft is empty.";
    return;
  }

  await flushPendingSave();
  const response = await fetch(`/api/samples/${encodeURIComponent(sample.sample_id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: { description: draft } }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    elements.qwenStatus.textContent = payload.error || "Failed to apply draft";
    setSaveMessage(payload.error || "Failed to apply draft");
    return;
  }

  replaceSample(payload.sample);
  state.summary = payload.summary;
  state.qwenDraft = null;
  updateSummaryFromSamples();
  render();
  setSaveMessage("Draft applied and saved");
}

function discardQwenDraft() {
  state.qwenDraft = null;
  renderQwenPanel(getSelectedSample());
  setSaveMessage("Draft discarded");
}

async function flushPendingSave() {
  if (!state.pendingSampleId || !Object.keys(state.pendingFields).length) {
    return;
  }

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
    state.saveTimer = null;
  }

  const sampleId = state.pendingSampleId;
  const fields = { ...state.pendingFields };
  state.pendingSampleId = null;
  state.pendingFields = {};
  setSaveMessage("Saving changes…");

  const response = await fetch(`/api/samples/${encodeURIComponent(sampleId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to save changes" }));
    setSaveMessage(payload.error || "Failed to save changes");
    return;
  }

  const payload = await response.json();
  replaceSample(payload.sample);
  state.summary = payload.summary;
  updateSummaryFromSamples();
  renderSummary();
  renderSampleList();
  renderFieldLists(payload.sample);
  setSaveMessage("All changes saved");
}

function replaceSample(sample) {
  const index = state.samples.findIndex((item) => item.sample_id === sample.sample_id);
  if (index >= 0) {
    state.samples.splice(index, 1, sample);
  }
}

function handleFieldChange(fieldName, value, flushImmediately = false) {
  const sample = getSelectedSample();
  if (!sample) {
    return;
  }
  const validation = validateFieldFormat(fieldName, value);
  const input = document.getElementById(`field-${fieldName}`);
  if (input) {
    input.setCustomValidity(validation.message);
    input.reportValidity();
  }
  if (!validation.valid) {
    setSaveMessage(validation.message);
    return;
  }
  sample[fieldName] = value;
  state.pendingSampleId = sample.sample_id;
  state.pendingFields[fieldName] = value;
  setSaveMessage("Unsaved changes…");
  updateSummaryFromSamples();
  renderSummary();
  renderSampleList();
  renderFieldLists(sample);

  if (state.saveTimer) {
    clearTimeout(state.saveTimer);
  }

  if (flushImmediately) {
    flushPendingSave();
    return;
  }

  state.saveTimer = setTimeout(() => {
    flushPendingSave();
  }, 350);
}

async function selectSample(sampleId) {
  if (state.selectedId === sampleId) {
    return;
  }
  await flushPendingSave();
  state.selectedId = sampleId;
  render();
}

async function moveSelection(direction) {
  const visible = getVisibleSamples();
  const index = visible.findIndex((sample) => sample.sample_id === state.selectedId);
  if (index === -1) {
    return;
  }
  const target = visible[index + direction];
  if (target) {
    await selectSample(target.sample_id);
  }
}

async function toggleDeletedState() {
  const sample = getSelectedSample();
  if (!sample) {
    return;
  }
  await flushPendingSave();
  const action = sample.is_deleted ? "restore" : "delete";
  const visibleBeforeAction = getVisibleSamples();
  const currentIndex = visibleBeforeAction.findIndex((item) => item.sample_id === sample.sample_id);
  setSaveMessage(sample.is_deleted ? "Restoring sample…" : "Deleting sample…");

  const response = await fetch(`/api/samples/${encodeURIComponent(sample.sample_id)}/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to update sample state" }));
    setSaveMessage(payload.error || "Failed to update sample state");
    return;
  }

  const payload = await response.json();
  replaceSample(payload.sample);
  state.summary = payload.summary;
  if (payload.sample.is_deleted) {
    const fallback =
      visibleBeforeAction[currentIndex + 1] ||
      visibleBeforeAction[currentIndex - 1] ||
      null;
    state.selectedId = fallback ? fallback.sample_id : null;
  }
  setSaveMessage(payload.sample.is_deleted ? "Sample deleted in workspace" : "Sample restored");
  render();
}

async function toggleSampleExportState(sampleId, isForExport) {
  await flushPendingSave();
  const response = await fetch(`/api/samples/${encodeURIComponent(sampleId)}/export-state`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_for_export: isForExport }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to update export state" }));
    setSaveMessage(payload.error || "Failed to update export state");
    return;
  }

  const payload = await response.json();
  replaceSample(payload.sample);
  state.summary = payload.summary;
  setSaveMessage(payload.sample.is_for_export ? "Sample marked Public" : "Sample marked Secret");
  render();
}

function getExportScope() {
  const scope = elements.exportScopeSelect?.value || "both";
  return ["public", "secret", "both"].includes(scope) ? scope : "both";
}

function exportScopeLabel(scope) {
  const labels = {
    public: "Public",
    secret: "Secret",
    both: "All",
  };
  return labels[scope] || labels.both;
}

async function exportWorkspace() {
  const exportScope = getExportScope();
  setSaveMessage(`Exporting ${exportScopeLabel(exportScope)} annotations…`);
  const response = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ include_description: true, export_scope: exportScope }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to export annotations" }));
    throw new Error(payload.error || "Failed to export annotations");
  }

  return response.json();
}

async function exportClips() {
  const exportScope = getExportScope();
  setSaveMessage(`Exporting ${exportScopeLabel(exportScope)} clips…`);
  const response = await fetch("/api/export-clips", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ export_scope: exportScope }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: "Failed to export clips" }));
    throw new Error(payload.error || "Failed to export clips");
  }

  return response.json();
}

async function exportAll() {
  await flushPendingSave();
  const exportScope = getExportScope();
  elements.exportButton.disabled = true;
  try {
    setSaveMessage(`Exporting ${exportScopeLabel(exportScope)} annotations and clips…`);
    const jsonPayload = await exportWorkspace();
    const clipsPayload = await exportClips();
    setSaveMessage(
      `Exported ${jsonPayload.sample_count} ${exportScopeLabel(exportScope)} rows with descriptions to ${
        jsonPayload.path
      }, and ${clipsPayload.sample_count} clips into ${clipsPayload.folder_count} folder${
        clipsPayload.folder_count === 1 ? "" : "s"
      } at ${clipsPayload.path}`
    );
  } catch (error) {
    setSaveMessage(error.message || "Export failed");
  } finally {
    elements.exportButton.disabled = false;
  }
}

async function saveRule(applyRetroactive) {
  const payload = collectRuleFormPayload();
  if (!payload.field_name) {
    setSaveMessage("Choose a field for the rule");
    return;
  }

  const selectedRule = getSelectedRule();
  const isNew = !selectedRule || selectedRule.id === "__new__";
  const route = isNew ? "/api/rules" : `/api/rules/${encodeURIComponent(selectedRule.id)}`;
  const method = isNew ? "POST" : "PATCH";
  setSaveMessage(applyRetroactive ? "Saving rule and recomputing samples…" : "Saving rule for future samples…");

  const response = await fetch(route, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rule: payload,
      apply_retroactive: applyRetroactive,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: "Failed to save rule" }));
    setSaveMessage(errorPayload.error || "Failed to save rule");
    return;
  }

  const result = await response.json();
  state.rules = result.rules;
  state.ruleCatalog = result.rules_payload;
  state.summary = result.summary;
  state.selectedRuleId = result.rule.id;
  if (applyRetroactive) {
    await loadSamples();
    ensureSelection();
  }
  render();
  setSaveMessage(
    applyRetroactive
      ? `Rule saved and ${result.updated_sample_count} sample${result.updated_sample_count === 1 ? "" : "s"} recomputed`
      : "Rule saved for future samples and imports"
  );
}

async function deleteSelectedRule(applyRetroactive) {
  const selectedRule = getSelectedRule();
  if (!selectedRule || selectedRule.id === "__new__") {
    return;
  }
  setSaveMessage(applyRetroactive ? "Deleting rule and recomputing samples…" : "Deleting rule for future samples…");
  const response = await fetch(`/api/rules/${encodeURIComponent(selectedRule.id)}/delete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apply_retroactive: applyRetroactive }),
  });
  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({ error: "Failed to delete rule" }));
    setSaveMessage(errorPayload.error || "Failed to delete rule");
    return;
  }

  const result = await response.json();
  state.rules = result.rules;
  state.ruleCatalog = result.rules_payload;
  state.summary = result.summary;
  state.selectedRuleId = "__new__";
  if (applyRetroactive) {
    await loadSamples();
    ensureSelection();
  }
  ensureRuleSelection();
  render();
  setSaveMessage(
    applyRetroactive
      ? `Rule deleted and ${result.updated_sample_count} sample${result.updated_sample_count === 1 ? "" : "s"} recomputed`
      : "Rule deleted for future samples and imports"
  );
}

function ensureSelection() {
  const visible = getVisibleSamples();
  if (!visible.length) {
    state.selectedId = null;
    return;
  }
  if (!visible.some((sample) => sample.sample_id === state.selectedId)) {
    state.selectedId = visible[0].sample_id;
  }
}

function bindEvents() {
  elements.samplesTabButton.addEventListener("click", () => {
    state.activeWorkspaceTab = "samples";
    render();
  });
  elements.sourceVideosTabButton.addEventListener("click", () => {
    state.activeWorkspaceTab = "source-videos";
    ensureSourceVideoSelection();
    render();
  });
  elements.rulesTabButton.addEventListener("click", () => {
    state.activeWorkspaceTab = "rules";
    ensureRuleSelection();
    render();
  });
  elements.sampleSidebarToggle.addEventListener("click", () => {
    state.sampleSidebarCollapsed = !state.sampleSidebarCollapsed;
    localStorage.setItem("annotationWorkspace.sampleSidebarCollapsed", state.sampleSidebarCollapsed ? "true" : "false");
    renderSampleSidebarState();
    requestAnimationFrame(updateVideoGridOverlaySizes);
  });
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    ensureSelection();
    render();
  });
  elements.sampleVisibilityFilter.addEventListener("change", (event) => {
    state.sampleVisibilityScope = event.target.value;
    ensureSelection();
    render();
  });
  elements.sourceVideoSearchInput.addEventListener("input", (event) => {
    state.sourceVideoSearch = event.target.value;
    ensureSourceVideoSelection();
    render();
  });
  elements.ruleSearchInput.addEventListener("input", (event) => {
    state.ruleSearch = event.target.value;
    ensureRuleSelection();
    render();
  });

  elements.showDeletedToggle.addEventListener("change", (event) => {
    state.showDeleted = event.target.checked;
    ensureSelection();
    render();
  });
  elements.violationInsightScopeSelect.addEventListener("change", (event) => {
    state.violationInsightScope = event.target.value;
    renderInsights();
  });
  elements.violationCompleteOnlyToggle.addEventListener("change", (event) => {
    state.violationCompleteOnly = event.target.checked;
    renderInsights();
  });
  elements.videoViolationInsightScopeSelect.addEventListener("change", (event) => {
    state.videoViolationInsightScope = event.target.value;
    renderInsights();
  });
  elements.videoViolationCompleteOnlyToggle.addEventListener("change", (event) => {
    state.videoViolationCompleteOnly = event.target.checked;
    renderInsights();
  });

  elements.shuffleButton.addEventListener("click", shuffleSamples);
  elements.newRuleButton.addEventListener("click", () => {
    state.selectedRuleId = "__new__";
    state.activeWorkspaceTab = "rules";
    render();
  });
  elements.prevButton.addEventListener("click", () => moveSelection(-1));
  elements.nextButton.addEventListener("click", () => moveSelection(1));
  elements.copyAnnotationButton.addEventListener("click", copySelectedAnnotationAsLatex);
  elements.deleteButton.addEventListener("click", toggleDeletedState);
  elements.batchDescriptionButton.addEventListener("click", openBatchDescriptionDialog);
  elements.batchDescriptionCancelButton.addEventListener("click", closeBatchDescriptionDialog);
  elements.batchDescriptionSelectAllButton.addEventListener("click", () => setBatchDescriptionCheckboxes(true));
  elements.batchDescriptionClearButton.addEventListener("click", () => setBatchDescriptionCheckboxes(false));
  elements.batchDescriptionStartButton.addEventListener("click", runBatchDescriptionGeneration);
  elements.qwenGenerateButton.addEventListener("click", generateQwenDescriptionDraft);
  elements.qwenApplyButton.addEventListener("click", applyQwenDraft);
  elements.qwenDiscardButton.addEventListener("click", discardQwenDraft);
  elements.qwenDraftDescription.addEventListener("input", (event) => {
    if (state.qwenDraft) {
      state.qwenDraft.draftDescription = event.target.value;
    }
  });
  elements.qwenProviderSelect.addEventListener("change", () => {
    const provider = elements.qwenProviderSelect.value === "lmstudio" ? "lmstudio" : "ollama";
    const oldDefault = provider === "lmstudio" ? QWEN_PROVIDER_DEFAULT_ENDPOINTS.ollama : QWEN_PROVIDER_DEFAULT_ENDPOINTS.lmstudio;
    if (!elements.qwenEndpointInput.value.trim() || elements.qwenEndpointInput.value.trim() === oldDefault) {
      elements.qwenEndpointInput.value = QWEN_PROVIDER_DEFAULT_ENDPOINTS[provider];
    }
    saveQwenSettings();
  });
  [elements.qwenEndpointInput, elements.qwenModelInput, elements.qwenKeyframeCountInput].forEach((input) => {
    input.addEventListener("change", saveQwenSettings);
    input.addEventListener("input", saveQwenSettings);
  });
  elements.exportButton.addEventListener("click", exportAll);
  elements.videoGridToggle.addEventListener("change", (event) => {
    state.showVideoGrid = event.target.checked;
    localStorage.setItem("annotationWorkspace.showVideoGrid", state.showVideoGrid ? "true" : "false");
    applyVideoGridPreference();
  });
  elements.sourceExtractStart.addEventListener("input", () => {
    syncClockField(elements.sourceExtractStart, elements.sourceExtractStartClock, true);
    syncSourceExtractFootageClockFields();
    updateSourceTimelineExtractionRange();
  });
  elements.sourceExtractEnd.addEventListener("input", () => {
    syncClockField(elements.sourceExtractEnd, elements.sourceExtractEndClock, true);
    syncSourceExtractFootageClockFields();
    updateSourceTimelineExtractionRange();
  });
  elements.sourceExtractStartClock.addEventListener("change", () => {
    if (syncSecondsField(elements.sourceExtractStart, elements.sourceExtractStartClock, true)) {
      syncSourceExtractFootageClockFields();
      updateSourceTimelineExtractionRange();
    }
  });
  elements.sourceExtractEndClock.addEventListener("change", () => {
    if (syncSecondsField(elements.sourceExtractEnd, elements.sourceExtractEndClock, true)) {
      syncSourceExtractFootageClockFields();
      updateSourceTimelineExtractionRange();
    }
  });
  elements.sourceExtractStartFootageClock.addEventListener("change", () => {
    if (syncSourceExtractSecondsFromFootage("start")) {
      updateSourceTimelineExtractionRange();
    }
  });
  elements.sourceExtractEndFootageClock.addEventListener("change", () => {
    if (syncSourceExtractSecondsFromFootage("end")) {
      updateSourceTimelineExtractionRange();
    }
  });
  elements.sourceFootageStartTime.addEventListener("change", () => {
    const video = getSelectedSourceVideo();
    if (!video) {
      return;
    }
    const nextValue = elements.sourceFootageStartTime.value.trim();
    if (nextValue && !isFootageStartTimeString(nextValue)) {
      elements.sourceFootageStartTime.setCustomValidity("Use HH:MM:SS");
      elements.sourceFootageStartTime.reportValidity();
      return;
    }
    elements.sourceFootageStartTime.setCustomValidity("");
    setFootageStartTimeState(video.source_video_key, nextValue);
    syncSourceExtractFootageClockFields();
    syncTrimFootageClockFields();
    renderGridCalibrationPanels();
    queueFootageStartTimeSave(video.source_video_key, nextValue);
  });
  elements.sourceExtractSetStart.addEventListener("click", () => setSourceExtractInputFromPlayer("start"));
  elements.sourceExtractSetEnd.addEventListener("click", () => setSourceExtractInputFromPlayer("end"));
  elements.sourceExtractReset.addEventListener("click", resetSourceExtractInputs);
  elements.sourceExtractCreate.addEventListener("click", createSampleFromSourceVideo);
  elements.sourceTimelineTrack.addEventListener("pointerdown", beginSourceTimelineDrag);
  elements.sourceTimelineTrack.addEventListener("pointermove", moveSourceTimelineDrag);
  elements.sourceTimelineTrack.addEventListener("pointerup", endSourceTimelineDrag);
  elements.sourceTimelineTrack.addEventListener("pointercancel", endSourceTimelineDrag);
  elements.saveRuleFutureButton.addEventListener("click", () => saveRule(false));
  elements.saveRuleRetroactiveButton.addEventListener("click", () => saveRule(true));
  elements.deleteRuleFutureButton.addEventListener("click", () => deleteSelectedRule(false));
  elements.deleteRuleRetroactiveButton.addEventListener("click", () => deleteSelectedRule(true));
  elements.sourceLibraryPlayer.addEventListener("timeupdate", () => {
    queueSourceVideoPositionSave();
    updateSourceTimelinePlayhead();
  });
  elements.sourceLibraryPlayer.addEventListener("seeked", updateSourceTimelinePlayhead);
  elements.sourceLibraryPlayer.addEventListener("loadedmetadata", renderSourceVideoTimeline);
  elements.sourceLibraryPlayer.addEventListener("pause", () => {
    const video = getSelectedSourceVideo();
    if (!video || !sourceVideoPlayerCanPersist(video.source_video_key)) {
      return;
    }
    persistSourceVideoPosition(video.source_video_key, elements.sourceLibraryPlayer.currentTime || 0).catch(() => {});
  });
  elements.sourceLibraryPlayer.addEventListener("ended", () => {
    const video = getSelectedSourceVideo();
    if (!video || !sourceVideoPlayerCanPersist(video.source_video_key)) {
      return;
    }
    persistSourceVideoPosition(video.source_video_key, elements.sourceLibraryPlayer.currentTime || 0).catch(() => {});
  });

  window.addEventListener("beforeunload", (event) => {
    const video = getSelectedSourceVideo();
    if (video && sourceVideoPlayerCanPersist(video.source_video_key)) {
      persistSourceVideoPosition(video.source_video_key, elements.sourceLibraryPlayer.currentTime || 0, true).catch(() => {});
    }
    if (state.pendingSampleId && Object.keys(state.pendingFields).length) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  window.addEventListener("resize", updateVideoGridOverlaySizes);
}

async function init() {
  renderQwenSettings();
  bindEvents();
  applyVideoGridPreference();
  try {
    await Promise.all([
      loadSchema(),
      loadSamples(),
      loadSourceVideos(),
      loadSourceVideoGridSettings(),
      loadSourceVideoFootageStartTimes(),
      loadRules(),
    ]);
    ensureSelection();
    ensureSourceVideoSelection();
    ensureRuleSelection();
    setSaveMessage("Workspace ready");
    render();
  } catch (error) {
    setSaveMessage(error.message || "Failed to load workspace");
  }
}

init();
