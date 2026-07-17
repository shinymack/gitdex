'use client';

import React, { useEffect, useRef, useState } from 'react';

interface FlickeringGridProps {
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  maxOpacity?: number;
  className?: string;
}

export function FlickeringGrid({
  squareSize = 4,
  gridGap = 15,
  flickerChance = 0.1,
  maxOpacity = 0.15,
  className = '',
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const mousePos = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        mousePos.current = {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
        };
      }
    };

    const handleMouseLeave = () => {
      mousePos.current = { x: -1000, y: -1000 };
    };

    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // HD DPI Canvas Scaling
    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    const cols = Math.floor(dimensions.width / (squareSize + gridGap)) + 1;
    const rows = Math.floor(dimensions.height / (squareSize + gridGap)) + 1;

    // Initialize cells with random base opacity
    const cells = Array.from({ length: cols * rows }, () => ({
      opacity: Math.random() * maxOpacity * 0.4,
      targetOpacity: Math.random() * maxOpacity,
      speed: 0.005 + Math.random() * 0.015,
    }));

    let animationFrameId: number;

    const getPrimaryColor = () => {
      if (typeof window === 'undefined') return { r: 16, g: 185, b: 129 }; // fallback emerald
      try {
        const style = getComputedStyle(document.documentElement);
        const primary = (style.getPropertyValue('--primary') || '').trim();
        if (primary.startsWith('#')) {
          const r = parseInt(primary.slice(1, 3), 16);
          const g = parseInt(primary.slice(3, 5), 16);
          const b = parseInt(primary.slice(5, 7), 16);
          return { r, g, b };
        }
      } catch (e) {
        // ignore
      }
      return { r: 16, g: 185, b: 129 };
    };

    const render = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      const color = getPrimaryColor();
      const rgbStr = `${color.r}, ${color.g}, ${color.b}`;

      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const index = c * rows + r;
          const cell = cells[index];

          if (!cell) continue;

          // Flicker Logic
          if (Math.random() < flickerChance) {
            cell.targetOpacity = Math.random() * maxOpacity;
          }

          // Interpolate opacity
          cell.opacity += (cell.targetOpacity - cell.opacity) * cell.speed;

          // Calculate cell position
          const x = c * (squareSize + gridGap);
          const y = r * (squareSize + gridGap);

          // Cursor interaction aura
          const dx = x - mousePos.current.x;
          const dy = y - mousePos.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const auraRadius = 160;

          let extraOpacity = 0;
          if (dist < auraRadius) {
            const factor = 1 - dist / auraRadius;
            extraOpacity = factor * maxOpacity * 1.5;
          }

          const finalOpacity = Math.min(maxOpacity * 2, cell.opacity + extraOpacity);

          // Skip drawing fully transparent cells for performance
          if (finalOpacity > 0.01) {
            ctx.fillStyle = `rgba(${rgbStr}, ${finalOpacity})`;
            ctx.fillRect(x, y, squareSize, squareSize);
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [dimensions, squareSize, gridGap, flickerChance, maxOpacity]);

  return (
    <div
      ref={containerRef}
      className={`absolute inset-0 w-full h-full pointer-events-none -z-10 ${className}`}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
        }}
      />
    </div>
  );
}
