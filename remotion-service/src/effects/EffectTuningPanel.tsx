// effects/EffectTuningPanel.tsx
// Remotion Studio 미리보기 위에 떠있는 튜닝 패널.
// - 전역 effect tuning을 즉시 수정해서 preview에 반영
// - localStorage에 저장 / 불러오기 / preset 적용
// - copy / paste / apply to all / apply to current scene
//
// 주의: 이 패널은 preview-only 도구다. 최종 mp4 렌더에서는
//        EffectTuningProvider가 inputProps로 받은 tuning을 사용한다.

import React, { useEffect, useMemo, useState } from 'react';
import { presets, vrewCodingClean } from './tuning';
import type {
  EffectTuning,
  PartialEffectTuning,
  CaptionEffect,
  CodeEffect,
  TerminalEffect,
  TransitionType,
  BackgroundType,
  Easing,
  CursorStyle,
} from './tuning';

const LS_KEY = 'vrew_effect_tuning_v1';
const LS_PRESETS_KEY = 'vrew_effect_tuning_user_presets_v1';
const LS_CLIP_KEY = 'vrew_effect_tuning_clipboard_v1';

type Tab = 'caption' | 'code' | 'terminal' | 'transition' | 'background' | 'presets';

export interface EffectTuningPanelProps {
  /** 현재 tuning을 부모가 들고 있을 때 사용 (없으면 패널 자체가 관리) */
  value?: EffectTuning;
  onChange?: (next: EffectTuning) => void;
  /** scene별 override 관리 (현재 scene id 와 setOverride 콜백) */
  currentSceneId?: string;
  onApplyToCurrentScene?: (sceneId: string, override: PartialEffectTuning) => void;
  onApplyToAllScenes?: (override: PartialEffectTuning) => void;
}

export const EffectTuningPanel: React.FC<EffectTuningPanelProps> = ({
  value,
  onChange,
  currentSceneId,
  onApplyToCurrentScene,
  onApplyToAllScenes,
}) => {
  const [internal, setInternal] = useState<EffectTuning>(() => {
    if (value) return value;
    try {
      const raw = typeof window !== 'undefined' && window.localStorage?.getItem(LS_KEY);
      if (raw) return JSON.parse(raw) as EffectTuning;
    } catch (_) {
      // ignore
    }
    return vrewCodingClean;
  });
  const tuning = value ?? internal;
  const [tab, setTab] = useState<Tab>('caption');

  const update = (next: EffectTuning) => {
    if (onChange) onChange(next);
    else setInternal(next);
    try {
      window.localStorage?.setItem(LS_KEY, JSON.stringify(next));
    } catch (_) {}
  };

  // 섹션 변경 헬퍼
  const setSection = <K extends keyof EffectTuning>(
    key: K,
    patch: Partial<EffectTuning[K]>,
  ) => {
    update({ ...tuning, [key]: { ...tuning[key], ...patch } } as EffectTuning);
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 360,
        maxHeight: '90vh',
        overflowY: 'auto',
        background: '#0f172a',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 14,
        padding: 14,
        color: '#e2e8f0',
        fontFamily:
          "system-ui,-apple-system,'Pretendard','Apple SD Gothic Neo',sans-serif",
        fontSize: 12,
        zIndex: 9999,
        boxShadow: '0 18px 48px rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          fontWeight: 700,
          fontSize: 14,
          marginBottom: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        Effect Tuning
        <span style={{ marginLeft: 'auto', color: '#94a3b8', fontWeight: 400 }}>
          preview only
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
        {(['caption', 'code', 'terminal', 'transition', 'background', 'presets'] as Tab[]).map(
          (k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              style={{
                padding: '5px 9px',
                background: tab === k ? '#7c3aed' : '#1e293b',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {k}
            </button>
          ),
        )}
      </div>

      {tab === 'caption' && (
        <CaptionTab tuning={tuning} set={(p) => setSection('caption', p)} />
      )}
      {tab === 'code' && <CodeTab tuning={tuning} set={(p) => setSection('code', p)} />}
      {tab === 'terminal' && (
        <TerminalTab tuning={tuning} set={(p) => setSection('terminal', p)} />
      )}
      {tab === 'transition' && (
        <TransitionTab tuning={tuning} set={(p) => setSection('transition', p)} />
      )}
      {tab === 'background' && (
        <BackgroundTab tuning={tuning} set={(p) => setSection('background', p)} />
      )}
      {tab === 'presets' && <PresetsTab tuning={tuning} update={update} />}

      <ActionBar
        tuning={tuning}
        currentSceneId={currentSceneId}
        onApplyToCurrentScene={onApplyToCurrentScene}
        onApplyToAllScenes={onApplyToAllScenes}
        onReset={() => update(vrewCodingClean)}
      />
    </div>
  );
};

// ── 공통 위젯들 ────────────────────────────────────────────────────────
const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
    <span style={{ width: 130, color: '#94a3b8', fontSize: 11 }}>{label}</span>
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>{children}</div>
  </div>
);

const Slider: React.FC<{
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}> = ({ value, min, max, step = 1, onChange }) => (
  <>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ flex: 1 }}
    />
    <input
      type="number"
      value={value}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: 58,
        background: '#1e293b',
        border: '1px solid #334155',
        color: '#e2e8f0',
        borderRadius: 4,
        padding: '2px 4px',
        fontSize: 11,
      }}
    />
  </>
);

const Color: React.FC<{ value: string; onChange: (v: string) => void }> = ({
  value,
  onChange,
}) => {
  // gradient 문자열은 color input에 못 넣으므로 그 경우 text input
  const isGradient = value.includes('gradient(');
  if (isGradient) {
    return (
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#e2e8f0',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 11,
        }}
      />
    );
  }
  return (
    <>
      <input
        type="color"
        value={value.length === 7 ? value : '#000000'}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: 32, height: 22, background: 'transparent', border: 'none' }}
      />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          background: '#1e293b',
          border: '1px solid #334155',
          color: '#e2e8f0',
          borderRadius: 4,
          padding: '2px 4px',
          fontSize: 11,
        }}
      />
    </>
  );
};

const Select = <T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value as T)}
    style={{
      flex: 1,
      background: '#1e293b',
      border: '1px solid #334155',
      color: '#e2e8f0',
      borderRadius: 4,
      padding: '3px 4px',
      fontSize: 11,
    }}
  >
    {options.map((o) => (
      <option key={o} value={o}>
        {o}
      </option>
    ))}
  </select>
);

const Toggle: React.FC<{ value: boolean; onChange: (v: boolean) => void }> = ({
  value,
  onChange,
}) => (
  <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
);

// ── Tab 내용 ───────────────────────────────────────────────────────────
const CaptionTab: React.FC<{
  tuning: EffectTuning;
  set: (p: Partial<EffectTuning['caption']>) => void;
}> = ({ tuning, set }) => {
  const c = tuning.caption;
  const effects: readonly CaptionEffect[] = [
    'vrew-chip',
    'big-bold',
    'typing',
    'karaoke',
    'word-pop',
    'minimal',
    'none',
  ] as const;
  return (
    <>
      <Row label="enabled">
        <Toggle value={c.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <Row label="effect">
        <Select value={c.effect} options={effects} onChange={(v) => set({ effect: v })} />
      </Row>
      <Row label="position">
        <Select
          value={c.position}
          options={['top', 'center', 'bottom'] as const}
          onChange={(v) => set({ position: v })}
        />
      </Row>
      <Row label="fontSize">
        <Slider value={c.fontSize} min={28} max={120} onChange={(v) => set({ fontSize: v })} />
      </Row>
      <Row label="fontWeight">
        <Slider
          value={c.fontWeight}
          min={300}
          max={900}
          step={100}
          onChange={(v) => set({ fontWeight: v })}
        />
      </Row>
      <Row label="lineHeight">
        <Slider
          value={c.lineHeight}
          min={1}
          max={2}
          step={0.05}
          onChange={(v) => set({ lineHeight: v })}
        />
      </Row>
      <Row label="maxCharsPerLine">
        <Slider value={c.maxCharsPerLine} min={6} max={30} onChange={(v) => set({ maxCharsPerLine: v })} />
      </Row>
      <Row label="activeWordScale">
        <Slider
          value={c.activeWordScale}
          min={1}
          max={1.5}
          step={0.01}
          onChange={(v) => set({ activeWordScale: v })}
        />
      </Row>
      <Row label="popScale">
        <Slider
          value={c.popScale}
          min={1}
          max={1.4}
          step={0.01}
          onChange={(v) => set({ popScale: v })}
        />
      </Row>
      <Row label="inactiveOpacity">
        <Slider
          value={c.inactiveOpacity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => set({ inactiveOpacity: v })}
        />
      </Row>
      <Row label="appearDuration">
        <Slider
          value={c.appearDuration}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(v) => set({ appearDuration: v })}
        />
      </Row>
      <Row label="disappearDuration">
        <Slider
          value={c.disappearDuration}
          min={0.05}
          max={1}
          step={0.01}
          onChange={(v) => set({ disappearDuration: v })}
        />
      </Row>
      <Row label="slideDistance">
        <Slider value={c.slideDistance} min={0} max={80} onChange={(v) => set({ slideDistance: v })} />
      </Row>
      <Row label="bounceIntensity">
        <Slider
          value={c.bounceIntensity}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => set({ bounceIntensity: v })}
        />
      </Row>
      <Row label="chipPaddingX">
        <Slider value={c.chipPaddingX} min={0} max={60} onChange={(v) => set({ chipPaddingX: v })} />
      </Row>
      <Row label="chipPaddingY">
        <Slider value={c.chipPaddingY} min={0} max={40} onChange={(v) => set({ chipPaddingY: v })} />
      </Row>
      <Row label="chipRadius">
        <Slider value={c.chipRadius} min={0} max={40} onChange={(v) => set({ chipRadius: v })} />
      </Row>
      <Row label="chipGap">
        <Slider value={c.chipGap} min={0} max={30} onChange={(v) => set({ chipGap: v })} />
      </Row>
      <Row label="chipShadowBlur">
        <Slider value={c.chipShadowBlur} min={0} max={80} onChange={(v) => set({ chipShadowBlur: v })} />
      </Row>
      <Row label="textColor">
        <Color value={c.textColor} onChange={(v) => set({ textColor: v })} />
      </Row>
      <Row label="highlightTextColor">
        <Color value={c.highlightTextColor} onChange={(v) => set({ highlightTextColor: v })} />
      </Row>
      <Row label="chipBackground">
        <Color value={c.chipBackground} onChange={(v) => set({ chipBackground: v })} />
      </Row>
      <Row label="highlightBackground">
        <Color value={c.highlightBackground} onChange={(v) => set({ highlightBackground: v })} />
      </Row>
      <Row label="offsetY">
        <Slider value={c.offsetY} min={-400} max={400} onChange={(v) => set({ offsetY: v })} />
      </Row>
    </>
  );
};

const CodeTab: React.FC<{
  tuning: EffectTuning;
  set: (p: Partial<EffectTuning['code']>) => void;
}> = ({ tuning, set }) => {
  const c = tuning.code;
  const effects: readonly CodeEffect[] = ['typing', 'line-by-line', 'highlight-line', 'fade-in', 'none'] as const;
  const cursors: readonly CursorStyle[] = ['bar', 'block', 'underscore', 'none'] as const;
  return (
    <>
      <Row label="enabled">
        <Toggle value={c.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <Row label="effect">
        <Select value={c.effect} options={effects} onChange={(v) => set({ effect: v })} />
      </Row>
      <Row label="fontSize">
        <Slider value={c.fontSize} min={18} max={64} onChange={(v) => set({ fontSize: v })} />
      </Row>
      <Row label="lineHeight">
        <Slider value={c.lineHeight} min={1} max={2.4} step={0.05} onChange={(v) => set({ lineHeight: v })} />
      </Row>
      <Row label="typingSpeed">
        <Slider value={c.typingSpeed} min={5} max={120} onChange={(v) => set({ typingSpeed: v })} />
      </Row>
      <Row label="typingDelay">
        <Slider
          value={c.typingDelay}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => set({ typingDelay: v })}
        />
      </Row>
      <Row label="cursorEnabled">
        <Toggle value={c.cursorEnabled} onChange={(v) => set({ cursorEnabled: v })} />
      </Row>
      <Row label="cursorStyle">
        <Select value={c.cursorStyle} options={cursors} onChange={(v) => set({ cursorStyle: v })} />
      </Row>
      <Row label="cursorBlinkSpeed">
        <Slider
          value={c.cursorBlinkSpeed}
          min={0.1}
          max={2}
          step={0.05}
          onChange={(v) => set({ cursorBlinkSpeed: v })}
        />
      </Row>
      <Row label="cursorColor">
        <Color value={c.cursorColor} onChange={(v) => set({ cursorColor: v })} />
      </Row>
      <Row label="activeLineScale">
        <Slider value={c.activeLineScale} min={1} max={1.2} step={0.01} onChange={(v) => set({ activeLineScale: v })} />
      </Row>
      <Row label="activeLineGlow">
        <Slider value={c.activeLineGlow} min={0} max={60} onChange={(v) => set({ activeLineGlow: v })} />
      </Row>
      <Row label="activeLineColor">
        <Color value={c.activeLineColor} onChange={(v) => set({ activeLineColor: v })} />
      </Row>
      <Row label="highlightColor">
        <Color value={c.highlightColor} onChange={(v) => set({ highlightColor: v })} />
      </Row>
      <Row label="scrollFollow">
        <Toggle value={c.scrollFollow} onChange={(v) => set({ scrollFollow: v })} />
      </Row>
      <Row label="scrollSpeed">
        <Slider value={c.scrollSpeed} min={0} max={3} step={0.05} onChange={(v) => set({ scrollSpeed: v })} />
      </Row>
      <Row label="zoomToActiveLine">
        <Toggle value={c.zoomToActiveLine} onChange={(v) => set({ zoomToActiveLine: v })} />
      </Row>
      <Row label="zoomScale">
        <Slider value={c.zoomScale} min={1} max={1.3} step={0.01} onChange={(v) => set({ zoomScale: v })} />
      </Row>
      <Row label="cardWidth">
        <Slider value={c.cardWidth} min={400} max={1080} onChange={(v) => set({ cardWidth: v })} />
      </Row>
      <Row label="cardHeight">
        <Slider value={c.cardHeight} min={300} max={1600} onChange={(v) => set({ cardHeight: v })} />
      </Row>
      <Row label="cardRadius">
        <Slider value={c.cardRadius} min={0} max={48} onChange={(v) => set({ cardRadius: v })} />
      </Row>
      <Row label="cardShadowBlur">
        <Slider value={c.cardShadowBlur} min={0} max={80} onChange={(v) => set({ cardShadowBlur: v })} />
      </Row>
    </>
  );
};

const TerminalTab: React.FC<{
  tuning: EffectTuning;
  set: (p: Partial<EffectTuning['terminal']>) => void;
}> = ({ tuning, set }) => {
  const c = tuning.terminal;
  const effects: readonly TerminalEffect[] = ['typing', 'command-run', 'line-output', 'none'] as const;
  return (
    <>
      <Row label="enabled">
        <Toggle value={c.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <Row label="effect">
        <Select value={c.effect} options={effects} onChange={(v) => set({ effect: v })} />
      </Row>
      <Row label="fontSize">
        <Slider value={c.fontSize} min={18} max={64} onChange={(v) => set({ fontSize: v })} />
      </Row>
      <Row label="lineHeight">
        <Slider value={c.lineHeight} min={1} max={2.4} step={0.05} onChange={(v) => set({ lineHeight: v })} />
      </Row>
      <Row label="typingSpeed">
        <Slider value={c.typingSpeed} min={5} max={120} onChange={(v) => set({ typingSpeed: v })} />
      </Row>
      <Row label="commandDelay">
        <Slider value={c.commandDelay} min={0} max={2} step={0.05} onChange={(v) => set({ commandDelay: v })} />
      </Row>
      <Row label="outputDelay">
        <Slider value={c.outputDelay} min={0} max={2} step={0.05} onChange={(v) => set({ outputDelay: v })} />
      </Row>
      <Row label="lineOutputDelay">
        <Slider value={c.lineOutputDelay} min={0} max={1} step={0.02} onChange={(v) => set({ lineOutputDelay: v })} />
      </Row>
      <Row label="cursorEnabled">
        <Toggle value={c.cursorEnabled} onChange={(v) => set({ cursorEnabled: v })} />
      </Row>
      <Row label="cursorBlinkSpeed">
        <Slider value={c.cursorBlinkSpeed} min={0.1} max={2} step={0.05} onChange={(v) => set({ cursorBlinkSpeed: v })} />
      </Row>
      <Row label="successColor">
        <Color value={c.successColor} onChange={(v) => set({ successColor: v })} />
      </Row>
      <Row label="errorColor">
        <Color value={c.errorColor} onChange={(v) => set({ errorColor: v })} />
      </Row>
      <Row label="warningColor">
        <Color value={c.warningColor} onChange={(v) => set({ warningColor: v })} />
      </Row>
      <Row label="normalColor">
        <Color value={c.normalColor} onChange={(v) => set({ normalColor: v })} />
      </Row>
      <Row label="cardWidth">
        <Slider value={c.cardWidth} min={400} max={1080} onChange={(v) => set({ cardWidth: v })} />
      </Row>
      <Row label="cardHeight">
        <Slider value={c.cardHeight} min={300} max={1600} onChange={(v) => set({ cardHeight: v })} />
      </Row>
    </>
  );
};

const TransitionTab: React.FC<{
  tuning: EffectTuning;
  set: (p: Partial<EffectTuning['transition']>) => void;
}> = ({ tuning, set }) => {
  const c = tuning.transition;
  const types: readonly TransitionType[] = ['cut', 'fade', 'slide', 'zoom-pop', 'wipe', 'none'] as const;
  const easings: readonly Easing[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'spring'] as const;
  return (
    <>
      <Row label="enabled">
        <Toggle value={c.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <Row label="type">
        <Select value={c.type} options={types} onChange={(v) => set({ type: v })} />
      </Row>
      <Row label="duration">
        <Slider value={c.duration} min={0} max={1.5} step={0.02} onChange={(v) => set({ duration: v })} />
      </Row>
      <Row label="easing">
        <Select value={c.easing} options={easings} onChange={(v) => set({ easing: v })} />
      </Row>
      <Row label="zoomFrom">
        <Slider value={c.zoomFrom} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ zoomFrom: v })} />
      </Row>
      <Row label="zoomTo">
        <Slider value={c.zoomTo} min={0.5} max={1.5} step={0.01} onChange={(v) => set({ zoomTo: v })} />
      </Row>
      <Row label="slideDirection">
        <Select
          value={c.slideDirection}
          options={['up', 'down', 'left', 'right'] as const}
          onChange={(v) => set({ slideDirection: v })}
        />
      </Row>
      <Row label="slideDistance">
        <Slider value={c.slideDistance} min={0} max={200} onChange={(v) => set({ slideDistance: v })} />
      </Row>
      <Row label="blurAmount">
        <Slider value={c.blurAmount} min={0} max={40} onChange={(v) => set({ blurAmount: v })} />
      </Row>
      <Row label="wipeAngle">
        <Slider value={c.wipeAngle} min={-90} max={90} onChange={(v) => set({ wipeAngle: v })} />
      </Row>
    </>
  );
};

const BackgroundTab: React.FC<{
  tuning: EffectTuning;
  set: (p: Partial<EffectTuning['background']>) => void;
}> = ({ tuning, set }) => {
  const c = tuning.background;
  const types: readonly BackgroundType[] = [
    'dark-gradient',
    'glassmorphism',
    'clean-white',
    'purple-tech',
    'terminal',
    'neon-grid',
    'none',
  ] as const;
  return (
    <>
      <Row label="enabled">
        <Toggle value={c.enabled} onChange={(v) => set({ enabled: v })} />
      </Row>
      <Row label="type">
        <Select value={c.type} options={types} onChange={(v) => set({ type: v })} />
      </Row>
      <Row label="motionSpeed">
        <Slider value={c.motionSpeed} min={0} max={2} step={0.05} onChange={(v) => set({ motionSpeed: v })} />
      </Row>
      <Row label="gradientShift">
        <Slider value={c.gradientShift} min={0} max={1} step={0.05} onChange={(v) => set({ gradientShift: v })} />
      </Row>
      <Row label="particleCount">
        <Slider value={c.particleCount} min={0} max={80} onChange={(v) => set({ particleCount: v })} />
      </Row>
      <Row label="particleSpeed">
        <Slider value={c.particleSpeed} min={0} max={3} step={0.05} onChange={(v) => set({ particleSpeed: v })} />
      </Row>
      <Row label="blurAmount">
        <Slider value={c.blurAmount} min={0} max={60} onChange={(v) => set({ blurAmount: v })} />
      </Row>
      <Row label="opacity">
        <Slider value={c.opacity} min={0} max={1} step={0.05} onChange={(v) => set({ opacity: v })} />
      </Row>
      <Row label="accentColor">
        <Color value={c.accentColor} onChange={(v) => set({ accentColor: v })} />
      </Row>
      <Row label="secondaryColor">
        <Color value={c.secondaryColor} onChange={(v) => set({ secondaryColor: v })} />
      </Row>
    </>
  );
};

const PresetsTab: React.FC<{
  tuning: EffectTuning;
  update: (t: EffectTuning) => void;
}> = ({ tuning, update }) => {
  const [userPresets, setUserPresets] = useState<Record<string, EffectTuning>>(() => {
    try {
      const raw = window.localStorage?.getItem(LS_PRESETS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return {};
  });
  const [name, setName] = useState('');
  const all = useMemo(() => ({ ...presets, ...userPresets }), [userPresets]);

  const save = () => {
    if (!name.trim()) return;
    const next = { ...userPresets, [name.trim()]: tuning };
    setUserPresets(next);
    try {
      window.localStorage?.setItem(LS_PRESETS_KEY, JSON.stringify(next));
    } catch (_) {}
    setName('');
  };
  const remove = (k: string) => {
    const next = { ...userPresets };
    delete next[k];
    setUserPresets(next);
    try {
      window.localStorage?.setItem(LS_PRESETS_KEY, JSON.stringify(next));
    } catch (_) {}
  };

  return (
    <>
      <div style={{ marginBottom: 8, color: '#94a3b8' }}>built-in</div>
      {Object.keys(presets).map((k) => (
        <button
          key={k}
          onClick={() => update(presets[k])}
          style={presetButtonStyle}
        >
          {k}
        </button>
      ))}
      <div style={{ margin: '12px 0 8px', color: '#94a3b8' }}>user</div>
      {Object.keys(userPresets).map((k) => (
        <div key={k} style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          <button onClick={() => update(userPresets[k])} style={{ ...presetButtonStyle, flex: 1 }}>
            {k}
          </button>
          <button
            onClick={() => remove(k)}
            style={{
              padding: '4px 8px',
              background: '#7f1d1d',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="preset name"
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            color: '#e2e8f0',
            borderRadius: 4,
            padding: '4px 6px',
            fontSize: 11,
          }}
        />
        <button
          onClick={save}
          style={{
            padding: '4px 10px',
            background: '#7c3aed',
            border: 'none',
            borderRadius: 4,
            color: '#fff',
            cursor: 'pointer',
            fontSize: 11,
          }}
        >
          save
        </button>
      </div>
    </>
  );
};

const presetButtonStyle: React.CSSProperties = {
  width: '100%',
  marginBottom: 4,
  padding: '6px 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#e2e8f0',
  textAlign: 'left',
  cursor: 'pointer',
  fontSize: 11,
};

const ActionBar: React.FC<{
  tuning: EffectTuning;
  currentSceneId?: string;
  onApplyToCurrentScene?: (sceneId: string, override: PartialEffectTuning) => void;
  onApplyToAllScenes?: (override: PartialEffectTuning) => void;
  onReset: () => void;
}> = ({ tuning, currentSceneId, onApplyToCurrentScene, onApplyToAllScenes, onReset }) => {
  const copy = () => {
    try {
      window.localStorage?.setItem(LS_CLIP_KEY, JSON.stringify(tuning));
    } catch (_) {}
  };
  const paste = () => {
    try {
      const raw = window.localStorage?.getItem(LS_CLIP_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PartialEffectTuning;
      if (currentSceneId && onApplyToCurrentScene) {
        onApplyToCurrentScene(currentSceneId, parsed);
      }
    } catch (_) {}
  };

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
      }}
    >
      <button onClick={onReset} style={actionBtn}>
        reset all
      </button>
      <button onClick={copy} style={actionBtn}>
        copy
      </button>
      <button onClick={paste} style={actionBtn}>
        paste → scene
      </button>
      {onApplyToCurrentScene && currentSceneId && (
        <button
          style={actionBtn}
          onClick={() => onApplyToCurrentScene(currentSceneId, tuning)}
        >
          apply → current scene
        </button>
      )}
      {onApplyToAllScenes && (
        <button style={actionBtn} onClick={() => onApplyToAllScenes(tuning)}>
          apply → all scenes
        </button>
      )}
    </div>
  );
};

const actionBtn: React.CSSProperties = {
  padding: '5px 8px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: 6,
  color: '#e2e8f0',
  cursor: 'pointer',
  fontSize: 11,
};
