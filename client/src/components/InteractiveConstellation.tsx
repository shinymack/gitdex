'use client';

import React, { useEffect, useRef, useState } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseX: number;
  baseY: number;
}

export default function InteractiveConstellation() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const mousePos = useRef({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight || 400,
        });
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mousePos.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        active: true,
      };
    };

    const handleMouseLeave = () => {
      mousePos.current.x = -1000;
      mousePos.current.y = -1000;
      mousePos.current.active = false;
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = dimensions.width * dpr;
    canvas.height = dimensions.height * dpr;
    ctx.scale(dpr, dpr);

    // Generate particles
    const particleCount = Math.min(65, Math.floor((dimensions.width * dimensions.height) / 3200));
    const particles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const x = Math.random() * dimensions.width;
      const y = Math.random() * dimensions.height;
      particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        radius: 1.5 + Math.random() * 2,
        baseX: x,
        baseY: y,
      });
    }

    let animationFrameId: number;
    let angle = 0;

    const getPrimaryColor = () => {
      if (typeof window === 'undefined') return { r: 16, g: 185, b: 129 };
      try {
        const style = getComputedStyle(document.documentElement);
        const primary = (style.getPropertyValue('--primary') || '').trim();
        if (primary.startsWith('#')) {
          return {
            r: parseInt(primary.slice(1, 3), 16),
            g: parseInt(primary.slice(3, 5), 16),
            b: parseInt(primary.slice(5, 7), 16),
          };
        }
      } catch (e) {}
      return { r: 16, g: 185, b: 129 };
    };

    const render = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);
      const color = getPrimaryColor();
      const rgbStr = `${color.r}, ${color.g}, ${color.b}`;

      // Slowly rotate/drift background angle for 3D parallax feel
      angle += 0.0005;
      const driftX = Math.sin(angle) * 8;
      const driftY = Math.cos(angle) * 8;

      // Update & Draw Particles
      particles.forEach((p) => {
        // Move particle with velocity
        p.x += p.vx;
        p.y += p.vy;

        // Bounce off walls
        if (p.x < 0 || p.x > dimensions.width) p.vx *= -1;
        if (p.y < 0 || p.y > dimensions.height) p.vy *= -1;

        // Mouse Physics Interaction (Magnetic Attraction)
        if (mousePos.current.active) {
          const dx = mousePos.current.x - p.x;
          const dy = mousePos.current.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxDist = 180;

          if (dist < maxDist) {
            const force = (maxDist - dist) / maxDist;
            // Pull particles slightly toward mouse cursor
            p.x += (dx / dist) * force * 0.9;
            p.y += (dy / dist) * force * 0.9;
          }
        }

        // Draw particle node
        ctx.beginPath();
        // Add drift for parallax
        ctx.arc(p.x + driftX, p.y + driftY, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgbStr}, 0.75)`;
        ctx.fill();
      });

      // Draw Connections (Lines)
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const p1 = particles[i];
          const p2 = particles[j];

          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxLinkDist = 100;

          if (dist < maxLinkDist) {
            const alpha = (1 - dist / maxLinkDist) * 0.22;
            ctx.beginPath();
            ctx.moveTo(p1.x + driftX, p1.y + driftY);
            ctx.lineTo(p2.x + driftX, p2.y + driftY);
            ctx.strokeStyle = `rgba(${rgbStr}, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }

        // Link to mouse
        if (mousePos.current.active) {
          const p = particles[i];
          const dx = p.x - mousePos.current.x;
          const dy = p.y - mousePos.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const maxMouseLinkDist = 140;

          if (dist < maxMouseLinkDist) {
            const alpha = (1 - dist / maxMouseLinkDist) * 0.35;
            ctx.beginPath();
            ctx.moveTo(p.x + driftX, p.y + driftY);
            ctx.lineTo(mousePos.current.x, mousePos.current.y);
            ctx.strokeStyle = `rgba(${rgbStr}, ${alpha})`;
            ctx.lineWidth = 1.0;
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [dimensions]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[320px] md:h-[450px] overflow-hidden select-none cursor-pointer"
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
