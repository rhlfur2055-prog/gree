// effects/EffectTuningContext.tsx
// 전역 + scene override를 합쳐서 하위 컴포넌트에 제공.
// 컴포넌트는 useEffectTuning() 으로 현재 scene에 적용된 최종 tuning을 읽는다.

import React, { createContext, useContext, useMemo } from 'react';
import { vrewCodingClean, mergeTuning } from './tuning';
import type { EffectTuning, PartialEffectTuning } from './tuning';

const TuningCtx = createContext<EffectTuning>(vrewCodingClean);

export interface EffectTuningProviderProps {
  /** 전역 effect tuning. 보통 inputProps에서 받은 값 또는 preset */
  tuning?: EffectTuning;
  /** 현재 scene용 부분 override — 이게 있으면 전역 위에 얹는다 */
  override?: PartialEffectTuning;
  children: React.ReactNode;
}

export const EffectTuningProvider: React.FC<EffectTuningProviderProps> = ({
  tuning,
  override,
  children,
}) => {
  const value = useMemo(() => {
    const base = tuning ?? vrewCodingClean;
    return mergeTuning(base, override);
  }, [tuning, override]);
  return <TuningCtx.Provider value={value}>{children}</TuningCtx.Provider>;
};

export const useEffectTuning = (): EffectTuning => useContext(TuningCtx);
