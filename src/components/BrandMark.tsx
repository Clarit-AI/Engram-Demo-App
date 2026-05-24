import type { CSSProperties } from 'react';

type Brand = 'engram' | 'clarit' | 'ovh';
type Tone = 'light' | 'dark' | 'muted' | 'primary' | 'engram';

const brandConfig: Record<Brand, { src: string; label: string; ratio: number }> = {
  engram: {
    src: '/brand/engram-logo-banner.png',
    label: 'Engram',
    ratio: 944 / 264,
  },
  clarit: {
    src: '/brand/clarit-ai-logo.png',
    label: 'Clarit.ai',
    ratio: 803 / 382,
  },
  ovh: {
    src: '/brand/ovhcloud-logo.webp',
    label: 'OVHcloud',
    ratio: 622 / 100,
  },
};

const toneBackground: Record<Tone, string> = {
  light: 'rgba(236, 245, 250, 0.92)',
  dark: 'rgba(25, 28, 30, 0.78)',
  muted: 'rgba(87, 98, 106, 0.68)',
  primary: 'var(--primary)',
  engram: 'linear-gradient(135deg, rgba(236,245,250,0.92) 0%, rgba(104,250,221,0.96) 100%)',
};

export function BrandMark({
  brand,
  tone = 'muted',
  className = '',
  label,
  style,
}: {
  brand: Brand;
  tone?: Tone;
  className?: string;
  label?: string;
  style?: CSSProperties;
}) {
  const config = brandConfig[brand];
  const maskImage = `url("${config.src}")`;

  return (
    <span
      aria-label={label ?? config.label}
      className={`inline-block shrink-0 ${className}`}
      role="img"
      style={{
        aspectRatio: `${config.ratio}`,
        background: toneBackground[tone],
        maskImage,
        WebkitMaskImage: maskImage,
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        ...style,
      }}
    />
  );
}

export function PoweredByOvh({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={compact ? 'pointer-events-auto flex shrink-0 items-center gap-1.5' : 'pointer-events-auto flex shrink-0 items-center gap-2'}
      title="Clarit.ai is a proud participant in the OVHcloud Startups Program."
      aria-label="Clarit.ai is a proud participant in the OVHcloud Startups Program."
    >
      <span className={compact ? 'font-mono text-[7px] uppercase tracking-[0.16em] text-text-muted' : 'font-mono text-[8px] font-semibold uppercase tracking-[0.16em] text-text-secondary'}>
        Powered by
      </span>
      <BrandMark
        brand="ovh"
        tone="primary"
        className={compact ? 'h-[10px] w-[62px]' : 'h-[17px] w-[106px]'}
      />
    </div>
  );
}
