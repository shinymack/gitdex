// src/components/MemoizedTerminal.tsx
'use client';

import { memo } from 'react';
import FaultyTerminal from '@/src/components/FaultyTerminal';

const MemoizedFaultyTerminal = memo(FaultyTerminal, () => true);

export default MemoizedFaultyTerminal;